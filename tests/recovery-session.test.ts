import { describe, expect, it } from "vitest";
import { hasRecentRecovery } from "../src/lib/auth/recovery-session";
describe("Password recovery session guard",()=>{
 const now=1_790_000_000_000;
 it("accepts only a recent signed recovery authentication method",()=>{
  expect(hasRecentRecovery({amr:[{method:"recovery",timestamp:now/1000-30}]},now)).toBe(true);
  expect(hasRecentRecovery({amr:[{method:"otp",timestamp:now/1000-30}]},now)).toBe(true);
  expect(hasRecentRecovery({amr:[{method:"password",timestamp:now/1000}]},now)).toBe(false);
  expect(hasRecentRecovery({amr:[{method:"otp",timestamp:now/1000-3601}]},now)).toBe(false);
  expect(hasRecentRecovery({amr:[{method:"recovery",timestamp:now/1000-3601}]},now)).toBe(false);
  expect(hasRecentRecovery({amr:[{method:"recovery",timestamp:now/1000+1}]},now)).toBe(false);
 });
});
