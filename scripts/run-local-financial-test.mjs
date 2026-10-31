import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const line = env.split(/\r?\n/).find((entry) => /^DATABASE_URL=/.test(entry));
if (!line) throw new Error("DATABASE_URL is required for the local SQL test.");
const connectionString = line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
const databaseUrl = new URL(connectionString);
if (!new Set(["127.0.0.1", "localhost"]).has(databaseUrl.hostname)) {
  throw new Error("Refusing to run a rollback test against a non-local database.");
}

const sql = postgres(connectionString, { max: 1, prepare: false });
const tenantId = randomUUID();
const userId = randomUUID();
const customerId = randomUUID();
const deviceId = randomUUID();
const contractId = randomUUID();
const loanId = randomUUID();
const installmentId = randomUUID();
const workerA = postgres(connectionString, { max: 1, prepare: false });
const workerB = postgres(connectionString, { max: 1, prepare: false });

function makeImei() {
  const digits = randomUUID().replaceAll("-", "").replace(/\D/g, "").padEnd(14, "0").slice(0, 14);
  for (let check = 0; check <= 9; check += 1) {
    const candidate = digits + check;
    let sum = 0;
    for (let index = 0; index < candidate.length; index += 1) {
      let digit = Number(candidate[index]);
      if (index % 2 === candidate.length % 2) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    if (sum % 10 === 0) return candidate;
  }
  throw new Error("Could not create a test IMEI.");
}

async function verifyConcurrentActivationAndReversal() {
  const fixture = {
    tenantId: randomUUID(), userId: randomUUID(), branchId: randomUUID(), customerId: randomUUID(),
    deviceId: randomUUID(), contractId: randomUUID(), loanId: randomUUID(), installmentId: randomUUID(),
    imei: makeImei(), email: `activation-race-${randomUUID()}@example.test`,
    contractNumber: `ACT-${randomUUID().slice(0, 8)}`,
  };
  const [cashAccount] = await sql`SELECT id FROM public.ledger_accounts WHERE tenant_id=${fixture.tenantId} AND code='CASH_RECEIPTS' LIMIT 1`;
  await sql.begin(async (tx) => {
    await tx`INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
      VALUES(${fixture.userId},'authenticated','authenticated',${fixture.email},'',now(),now(),now(),'{}','{}')`;
    await tx`INSERT INTO public.tenants(id,name) VALUES(${fixture.tenantId},'Disposable activation concurrency test')`;
    await tx`INSERT INTO public.branches(id,tenant_id,name,code,active) VALUES(${fixture.branchId},${fixture.tenantId},'Race branch','ACT-RACE',true)`;
    await tx`INSERT INTO public.tenant_memberships(tenant_id,user_id,role) VALUES(${fixture.tenantId},${fixture.userId},'tenant_admin')`;
    await tx`INSERT INTO public.customers(id,tenant_id,branch_id,full_name)
      VALUES(${fixture.customerId},${fixture.tenantId},${fixture.branchId},'Cliente concurrencia activación')`;
    await tx`INSERT INTO public.devices(id,tenant_id,branch_id,imei,brand,model)
      VALUES(${fixture.deviceId},${fixture.tenantId},${fixture.branchId},${fixture.imei},'Prueba','Activación concurrente')`;
    await tx`INSERT INTO public.credit_contracts(id,tenant_id,branch_id,customer_id,contract_number,terms)
      VALUES(${fixture.contractId},${fixture.tenantId},${fixture.branchId},${fixture.customerId},${fixture.contractNumber},'{"downPayment":"10.00"}')`;
    await tx`INSERT INTO public.loans(id,tenant_id,branch_id,customer_id,contract_id,device_id,status,sale_price,down_payment,principal,interest_rate,installment_count,calculation_strategy)
      VALUES(${fixture.loanId},${fixture.tenantId},${fixture.branchId},${fixture.customerId},${fixture.contractId},${fixture.deviceId},'approved',40,10,30,0,1,'activation-race')`;
    await tx`INSERT INTO public.installments(id,tenant_id,loan_id,sequence,due_date,amount_due)
      VALUES(${fixture.installmentId},${fixture.tenantId},${fixture.loanId},1,current_date+30,30)`;
  });

  async function race(statement, parameterLists) {
    let readyCount = 0;
    let signalReady;
    let release;
    const bothReady = new Promise((resolve) => { signalReady = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    const attempts = [workerA,workerB].map((client,index) => client.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE authenticated");
      await tx`SELECT set_config('request.jwt.claim.sub',${fixture.userId},true)`;
      await tx`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.userId, aal: "aal1" })},true)`;
      readyCount += 1;
      if (readyCount === 2) signalReady();
      await gate;
      const [result] = await tx.unsafe(Array.isArray(statement) ? statement[index] : statement, parameterLists[index]);
      return result.result;
    }));
    await bothReady;
    release();
    return Promise.allSettled(attempts);
  }

  try {
    const activationSql = "SELECT public.activate_approved_loan_with_evidence($1::uuid,'cash','RACE-INITIAL',$2::uuid,'test/private-contract.pdf',true,(now() AT TIME ZONE 'America/Santo_Domingo')::date,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true) AS result";
    const sharedKey = randomUUID();
    const sameKey = await race(activationSql, [[fixture.loanId,sharedKey],[fixture.loanId,sharedKey]]);
    if (sameKey.some((outcome) => outcome.status !== "fulfilled") || sameKey[0].value !== sameKey[1].value) {
      throw new Error(`Concurrent same-key activation was not idempotent: ${sameKey.map((item) => item.status === "fulfilled" ? item.value : `${item.reason?.code}:${item.reason?.message}`).join(" | ")}`);
    }

    const reversalSql = "SELECT public.reverse_loan_payment($1::uuid,'Concurrent activation test reversal') AS result";
    async function assertSingleConcurrentReversal(paymentId) {
      const outcomes = await race(reversalSql, [[paymentId],[paymentId]]);
      const succeeded = outcomes.filter((outcome) => outcome.status === "fulfilled");
      const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
      if (succeeded.length !== 1 || rejected.length !== 1 || rejected[0].reason?.code !== "22023"
          || !String(rejected[0].reason?.message).includes("PAYMENT_ALREADY_REVERSED")) {
        throw new Error(`Concurrent reversal was not exactly-once: ${outcomes.map((item) => item.status === "fulfilled" ? "ok" : `${item.reason?.code}:${item.reason?.message}`).join(" | ")}`);
      }
    }
    await assertSingleConcurrentReversal(sameKey[0].value);

    const differentKeys = await race(activationSql, [[fixture.loanId,randomUUID()],[fixture.loanId,randomUUID()]]);
    const activated = differentKeys.filter((outcome) => outcome.status === "fulfilled");
    const denied = differentKeys.filter((outcome) => outcome.status === "rejected");
    if (activated.length !== 1 || denied.length !== 1 || denied[0].reason?.code !== "22023"
        || !String(denied[0].reason?.message).includes("LOAN_NOT_APPROVED")) {
      throw new Error(`Concurrent different-key activation duplicated or failed unexpectedly: ${differentKeys.map((item) => item.status === "fulfilled" ? "ok" : `${item.reason?.code}:${item.reason?.message}`).join(" | ")}`);
    }
    await assertSingleConcurrentReversal(activated[0].value);

    const [state] = await sql`
      SELECT (SELECT count(*)::int FROM public.payments WHERE tenant_id=${fixture.tenantId}) AS payments,
        (SELECT count(*)::int FROM public.payments WHERE tenant_id=${fixture.tenantId} AND reversed_at IS NOT NULL) AS reversed,
        (SELECT count(*)::int FROM public.ledger_entries WHERE tenant_id=${fixture.tenantId} AND entry_type='payment_reversal') AS reversals,
        (SELECT coalesce(sum(amount),0)::numeric FROM public.ledger_entries WHERE tenant_id=${fixture.tenantId}) AS ledger_net,
        (SELECT amount_paid::numeric FROM public.installments WHERE id=${fixture.installmentId}) AS installment_paid,
        (SELECT status::text FROM public.loans WHERE id=${fixture.loanId}) AS loan_status,
        (SELECT count(*)::int FROM public.audit_logs WHERE tenant_id=${fixture.tenantId} AND action='loan.activated') AS activations,
        (SELECT count(*)::int FROM public.audit_logs WHERE tenant_id=${fixture.tenantId} AND action='payment.reversed') AS reversal_audits`;
    if (Number(state.payments) !== 2 || Number(state.reversed) !== 2 || Number(state.reversals) !== 2
        || Number(state.ledger_net) !== 0 || Number(state.installment_paid) !== 0 || state.loan_status !== "approved"
        || Number(state.activations) !== 2 || Number(state.reversal_audits) !== 2) {
      throw new Error(`Concurrent activation/reversal left inconsistent records: ${JSON.stringify(state)}`);
    }
    process.stdout.write("Concurrent activation/reversal passed: same-key calls returned one initial payment; different keys produced one activation; each reversal wrote one compensating entry, restored approval, and audited once.\n");
    const closeSql = "SELECT public.close_cash_day($1::uuid,$2::uuid,$3::uuid,(clock_timestamp() AT TIME ZONE 'America/Santo_Domingo')::date,'down_payment',0,0,0,'Concurrency test: declared zero') AS result";
    const closeRace = await race([activationSql, closeSql], [[fixture.loanId, randomUUID()], [fixture.tenantId, fixture.branchId, fixture.userId]]);
    if (closeRace[1].status !== "fulfilled" || (closeRace[0].status === "rejected" && !String(closeRace[0].reason?.message).includes("CASH_ALREADY_CLOSED"))) {
      throw new Error("Concurrent posting/closing did not serialize as expected.");
    }
    const [closingState] = await sql`SELECT c.expected_cash,(SELECT coalesce(sum(e.amount),0) FROM public.ledger_entries e WHERE e.tenant_id=c.tenant_id) AS ledger_net
      FROM public.cash_closings c WHERE c.tenant_id=${fixture.tenantId}`;
    if (!closingState || Number(closingState.expected_cash) !== Number(closingState.ledger_net)
      || Number(closingState.ledger_net) !== (closeRace[0].status === "fulfilled" ? 10 : 0)) {
      throw new Error("A concurrent payment changed a closed cash snapshot.");
    }
    process.stdout.write("Concurrent posting/closing passed: payment was either included in the immutable close or rejected atomically.\n");
  } finally {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM public.cash_closings WHERE tenant_id=${fixture.tenantId}`;
      await tx`DELETE FROM public.audit_logs WHERE tenant_id=${fixture.tenantId}`;
      await tx`DELETE FROM public.ledger_entries WHERE tenant_id=${fixture.tenantId}`;
      await tx`DELETE FROM public.payment_allocations WHERE tenant_id=${fixture.tenantId}`;
      await tx`DELETE FROM public.payment_evidence WHERE tenant_id=${fixture.tenantId}`;
      await tx`DELETE FROM public.payments WHERE tenant_id=${fixture.tenantId}`;
      await tx`DELETE FROM public.installments WHERE tenant_id=${fixture.tenantId}`;
      await tx`DELETE FROM public.loans WHERE tenant_id=${fixture.tenantId}`;
      await tx`DELETE FROM public.credit_contracts WHERE tenant_id=${fixture.tenantId}`;
      await tx`DELETE FROM public.devices WHERE tenant_id=${fixture.tenantId}`;
      await tx`DELETE FROM public.customers WHERE tenant_id=${fixture.tenantId}`;
      if (!cashAccount) await tx`DELETE FROM public.ledger_accounts a WHERE a.tenant_id=${fixture.tenantId} AND a.code='CASH_RECEIPTS'
        AND NOT EXISTS(SELECT 1 FROM public.ledger_entries e WHERE e.account_id=a.id)`;
      await tx`DELETE FROM public.tenant_memberships WHERE tenant_id=${fixture.tenantId}`;
      await tx`DELETE FROM public.branches WHERE tenant_id=${fixture.tenantId}`;
      await tx`DELETE FROM app_private.document_counters WHERE tenant_id=${fixture.tenantId}`;
      await tx`DELETE FROM public.tenants WHERE id=${fixture.tenantId}`;
      await tx`DELETE FROM auth.users WHERE id=${fixture.userId}`;
    });
    const [leftovers] = await sql`
      SELECT EXISTS(SELECT 1 FROM public.tenants WHERE id=${fixture.tenantId}) AS tenant,
        EXISTS(SELECT 1 FROM auth.users WHERE id=${fixture.userId}) AS auth_user,
        EXISTS(SELECT 1 FROM public.payments WHERE tenant_id=${fixture.tenantId}) AS payments,
        EXISTS(SELECT 1 FROM public.audit_logs WHERE tenant_id=${fixture.tenantId}) AS audit`;
    if (Object.values(leftovers).some(Boolean)) throw new Error(`Activation concurrency fixture cleanup failed: ${JSON.stringify(leftovers)}`);
  }
}

async function verifyConcurrentMembershipLockoutGuard() {
  const fixture = {
    tenantId: randomUUID(), userA: randomUUID(), userB: randomUUID(),
    membershipA: randomUUID(), membershipB: randomUUID(),
  };
  await sql.begin(async (tx) => {
    for (const [userId, suffix] of [[fixture.userA,"a"],[fixture.userB,"b"]]) {
      await tx`INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
        VALUES(${userId},'authenticated','authenticated',${`membership-race-${suffix}-${userId}@example.test`},'',now(),now(),now(),'{}','{}')`;
    }
    await tx`INSERT INTO public.tenants(id,name) VALUES(${fixture.tenantId},'Disposable membership concurrency test')`;
    await tx`INSERT INTO public.tenant_memberships(id,tenant_id,user_id,role,branch_id,status) VALUES
      (${fixture.membershipA},${fixture.tenantId},${fixture.userA},'tenant_admin',NULL,'active'),
      (${fixture.membershipB},${fixture.tenantId},${fixture.userB},'tenant_admin',NULL,'active')`;
  });

  let readyCount = 0;
  let signalReady;
  let release;
  const bothReady = new Promise((resolve) => { signalReady = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const attempts = [[workerA,fixture.userA,fixture.membershipA],[workerB,fixture.userB,fixture.membershipB]]
    .map(([client,userId,membershipId]) => client.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE authenticated");
      await tx`SELECT set_config('request.jwt.claim.sub',${userId},true)`;
      await tx`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: userId, aal: "aal1" })},true)`;
      readyCount += 1;
      if (readyCount === 2) signalReady();
      await gate;
      await tx.unsafe("SELECT public.manage_tenant_membership($1::uuid,'tenant_admin'::public.member_role,NULL,'suspended')",[membershipId]);
      return membershipId;
    }));
  await bothReady;
  release();
  try {
    const outcomes = await Promise.allSettled(attempts);
    const succeeded = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    if (succeeded.length !== 1 || rejected.length !== 1 || rejected[0].reason?.code !== "22023"
        || !String(rejected[0].reason?.message).includes("LAST_TENANT_ADMIN")) {
      throw new Error(`Concurrent membership changes could remove all central administrators: ${outcomes.map((item) => item.status === "fulfilled" ? "ok" : `${item.reason?.code}:${item.reason?.message}`).join(" | ")}`);
    }
    const [state] = await sql`
      SELECT (SELECT count(*)::int FROM public.tenant_memberships WHERE tenant_id=${fixture.tenantId}
        AND role='tenant_admin' AND branch_id IS NULL AND status='active') AS active_central_admins,
        (SELECT count(*)::int FROM public.audit_logs WHERE tenant_id=${fixture.tenantId} AND action='membership.updated') AS updates`;
    if (Number(state.active_central_admins) !== 1 || Number(state.updates) !== 1) {
      throw new Error(`Concurrent membership change left invalid administration state: ${JSON.stringify(state)}`);
    }
    process.stdout.write("Concurrent membership guard passed: exactly one demotion committed; one active tenant administrator and one audit entry remained.\n");
  } finally {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM public.audit_logs WHERE tenant_id=${fixture.tenantId}`;
      await tx`DELETE FROM public.tenant_memberships WHERE tenant_id=${fixture.tenantId}`;
      await tx`DELETE FROM public.tenants WHERE id=${fixture.tenantId}`;
      await tx`DELETE FROM auth.users WHERE id IN (${fixture.userA},${fixture.userB})`;
    });
    const [leftovers] = await sql`
      SELECT EXISTS(SELECT 1 FROM public.tenants WHERE id=${fixture.tenantId}) AS tenant,
        EXISTS(SELECT 1 FROM auth.users WHERE id IN (${fixture.userA},${fixture.userB})) AS users,
        EXISTS(SELECT 1 FROM public.audit_logs WHERE tenant_id=${fixture.tenantId}) AS audit`;
    if (Object.values(leftovers).some(Boolean)) throw new Error(`Membership concurrency fixture cleanup failed: ${JSON.stringify(leftovers)}`);
  }
}

async function verifyConcurrentPayment() {
  await sql.begin(async (tx) => {
    await tx`INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
      VALUES(${userId},'authenticated','authenticated',${`concurrency-${userId}@example.test`},'',now(),now(),now(),'{}','{}')`;
    await tx`INSERT INTO public.tenants(id,name) VALUES(${tenantId},'Disposable payment concurrency test')`;
    await tx`INSERT INTO public.tenant_memberships(tenant_id,user_id,role) VALUES(${tenantId},${userId},'tenant_admin')`;
    await tx`INSERT INTO public.customers(id,tenant_id,full_name,identity_number)
      VALUES(${customerId},${tenantId},'Cliente concurrencia','TEST-CONCURRENCY-'||left(${userId}::text,12))`;
    await tx`INSERT INTO public.devices(id,tenant_id,imei,brand,model)
      VALUES(${deviceId},${tenantId},'490154203237518','Prueba','Concurrencia')`;
    await tx`INSERT INTO public.credit_contracts(id,tenant_id,customer_id,contract_number,terms)
      VALUES(${contractId},${tenantId},${customerId},${'CONC-' + userId.slice(0,8)},'{}')`;
    await tx`INSERT INTO public.loans(id,tenant_id,customer_id,contract_id,device_id,status,sale_price,down_payment,principal,interest_rate,installment_count,calculation_strategy)
      VALUES(${loanId},${tenantId},${customerId},${contractId},${deviceId},'active',20,0,20,0,1,'test-concurrency')`;
    await tx`INSERT INTO public.installments(id,tenant_id,loan_id,sequence,due_date,amount_due)
      VALUES(${installmentId},${tenantId},${loanId},1,current_date,20)`;
  });

  let readyCount = 0;
  let signalReady;
  let release;
  const bothReady = new Promise((resolve) => { signalReady = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const post = (client, idempotencyKey = randomUUID(), reference = `parallel-${randomUUID()}`) => client.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE authenticated");
    await tx`SELECT set_config('request.jwt.claim.sub',${userId},true)`;
    await tx`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: userId, aal: "aal1" })},true)`;
    readyCount += 1;
    if (readyCount === 2) signalReady();
    await gate;
    const [result] = await tx.unsafe(
      "SELECT public.record_loan_payment_with_evidence($1::uuid,15,$2::uuid,'cash',$3::text,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true) AS payment_id",
      [loanId,idempotencyKey,reference],
    );
    return result.payment_id;
  });

  const attempts = [post(workerA),post(workerB)];
  await bothReady;
  release();
  const outcomes = await Promise.allSettled(attempts);
  const succeeded = outcomes.filter((outcome) => outcome.status === "fulfilled");
  const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
  if (succeeded.length !== 1 || rejected.length !== 1
      || rejected[0].reason?.code !== "22023"
      || !String(rejected[0].reason?.message).includes("PAYMENT_EXCEEDS_BALANCE")) {
    throw new Error(`Expected one concurrent payment and one balance rejection; outcomes: ${outcomes.map((item) => item.status === "fulfilled" ? "ok" : `${item.reason?.code}:${item.reason?.message}`).join(" | ")}`);
  }

  const [paymentState] = await sql`
    SELECT (SELECT count(*)::int FROM public.payments WHERE tenant_id=${tenantId}) AS payments,
      (SELECT coalesce(sum(amount),0)::numeric FROM public.payment_allocations WHERE tenant_id=${tenantId}) AS allocated,
      (SELECT coalesce(sum(amount),0)::numeric FROM public.ledger_entries WHERE tenant_id=${tenantId} AND entry_type='payment_received') AS posted,
      (SELECT amount_paid::numeric FROM public.installments WHERE id=${installmentId}) AS installment_paid,
      (SELECT status::text FROM public.loans WHERE id=${loanId}) AS loan_status`;
  if (Number(paymentState.payments) !== 1 || Number(paymentState.allocated) !== 15
      || Number(paymentState.posted) !== 15 || Number(paymentState.installment_paid) !== 15
      || paymentState.loan_status !== "active") {
    throw new Error(`Concurrent posting left inconsistent financial records: ${JSON.stringify(paymentState)}`);
  }

  const winnerId = outcomes.find((outcome) => outcome.status === "fulfilled").value;
  await workerA.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE authenticated");
    await tx`SELECT set_config('request.jwt.claim.sub',${userId},true)`;
    await tx`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: userId, aal: "aal1" })},true)`;
    await tx.unsafe("SELECT public.reverse_loan_payment($1::uuid,'Cleanup before idempotent concurrency retry')",[winnerId]);
  });

  let retryReadyCount = 0;
  let signalRetryReady;
  let releaseRetry;
  const bothRetryReady = new Promise((resolve) => { signalRetryReady = resolve; });
  const retryGate = new Promise((resolve) => { releaseRetry = resolve; });
  const retryKey = randomUUID();
  const retryReference = `retry-${randomUUID()}`;
  const retry = (client) => client.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE authenticated");
    await tx`SELECT set_config('request.jwt.claim.sub',${userId},true)`;
    await tx`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: userId, aal: "aal1" })},true)`;
    retryReadyCount += 1;
    if (retryReadyCount === 2) signalRetryReady();
    await retryGate;
    const [result] = await tx.unsafe(
      "SELECT public.record_loan_payment_with_evidence($1::uuid,15,$2::uuid,'cash',$3::text,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true) AS payment_id",
      [loanId,retryKey,retryReference],
    );
    return result.payment_id;
  });
  const retries = [retry(workerA),retry(workerB)];
  await bothRetryReady;
  releaseRetry();
  const retryOutcomes = await Promise.allSettled(retries);
  if (retryOutcomes.some((outcome) => outcome.status !== "fulfilled")
      || retryOutcomes[0].value !== retryOutcomes[1].value) {
    throw new Error(`Concurrent idempotent retries did not return the same payment: ${retryOutcomes.map((item) => item.status === "fulfilled" ? item.value : `${item.reason?.code}:${item.reason?.message}`).join(" | ")}`);
  }

  const [retryState] = await sql`
    SELECT (SELECT count(*)::int FROM public.payments WHERE tenant_id=${tenantId}) AS payments,
      (SELECT count(*)::int FROM public.payments WHERE tenant_id=${tenantId} AND reversed_at IS NULL) AS active_payments,
      (SELECT coalesce(sum(a.amount),0)::numeric FROM public.payment_allocations a JOIN public.payments p ON p.id=a.payment_id
        WHERE a.tenant_id=${tenantId} AND p.reversed_at IS NULL) AS allocated,
      (SELECT coalesce(sum(amount),0)::numeric FROM public.ledger_entries WHERE tenant_id=${tenantId}) AS ledger_net,
      (SELECT amount_paid::numeric FROM public.installments WHERE id=${installmentId}) AS installment_paid,
      (SELECT status::text FROM public.loans WHERE id=${loanId}) AS loan_status`;
  if (Number(retryState.payments) !== 2 || Number(retryState.active_payments) !== 1
      || Number(retryState.allocated) !== 15 || Number(retryState.ledger_net) !== 15
      || Number(retryState.installment_paid) !== 15 || retryState.loan_status !== "active") {
    throw new Error(`Concurrent retry/reversal left inconsistent financial records: ${JSON.stringify(retryState)}`);
  }
}

async function cleanupConcurrencyFixture() {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM public.audit_logs WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.ledger_entries WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.payment_allocations WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.payment_evidence WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.payments WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.installments WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.loans WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.credit_applications WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.credit_contracts WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.mdm_commands WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.devices WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.customers WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.ledger_accounts WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.notifications WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.mdm_providers WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.tenant_settings WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.financing_settings WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.tenant_memberships WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.branches WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM app_private.document_counters WHERE tenant_id=${tenantId}`;
    await tx`DELETE FROM public.tenants WHERE id=${tenantId}`;
    await tx`DELETE FROM auth.users WHERE id=${userId}`;
  });
  const [leftovers] = await sql`
    SELECT EXISTS(SELECT 1 FROM public.tenants WHERE id=${tenantId}) AS tenant,
      EXISTS(SELECT 1 FROM auth.users WHERE id=${userId}) AS auth_user,
      EXISTS(SELECT 1 FROM public.payments WHERE tenant_id=${tenantId}) AS payments`;
  if (leftovers.tenant || leftovers.auth_user || leftovers.payments) {
    throw new Error(`Concurrency test fixture cleanup failed: ${JSON.stringify(leftovers)}`);
  }
}

try {
  for (const testName of (process.argv.includes("--concurrency-only") ? [] : ["financial_defaults_hardening.sql", "financial_integrity.sql", "rls_tenant_isolation.sql", "branch_isolation.sql", "role_financial_permissions.sql", "admin_mfa.sql"])) {
    const source = readFileSync(new URL(`../supabase/tests/${testName}`, import.meta.url), "utf8");
    await sql.unsafe(source).simple();
    process.stdout.write(`${testName} passed; test transaction rolled back.\n`);
  }
  try {
    await verifyConcurrentPayment();
    process.stdout.write("Concurrent payment/retry test passed; overpayment was blocked, duplicate retries returned one payment, reversal netted correctly, and fake fixtures were cleaned up.\n");
  } finally {
    await cleanupConcurrencyFixture();
  }
  await verifyConcurrentActivationAndReversal();
  await verifyConcurrentMembershipLockoutGuard();
} finally {
  await Promise.all([workerA.end({ timeout: 5 }),workerB.end({ timeout: 5 })]);
  await sql.end({ timeout: 5 });
}
