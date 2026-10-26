import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const newPassword = process.argv[2];
if (!newPassword || newPassword.length < 6) {
  console.error("Uso: node scripts/set-admin-password.mjs <nueva-contraseña-minimo-6-caracteres>");
  process.exit(1);
}

const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envFile
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx), line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "")];
    })
);

const email = env.KREDIMAX_LOCAL_ADMIN_EMAIL;
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;

if (!email || !supabaseUrl || !secretKey) {
  console.error("Faltan variables en .env.local (KREDIMAX_LOCAL_ADMIN_EMAIL, NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY).");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(`Buscando usuario ${email}...`);
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error("Error al consultar usuarios en Supabase:", listError.message);
    process.exit(1);
  }

  let user = usersData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (!user) {
    console.log(`El usuario ${email} no existe en Auth. Creándolo...`);
    const { error: createError } = await supabase.auth.admin.createUser({
      email,
      password: newPassword,
      email_confirm: true,
      user_metadata: { full_name: "Administrador KrediMax" },
    });
    if (createError) {
      console.error("Error al crear usuario:", createError.message);
      process.exit(1);
    }
    console.log(`✓ Usuario creado exitosamente con la contraseña especificada.`);
  } else {
    console.log(`Actualizando contraseña para el usuario existente (ID: ${user.id})...`);
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (updateError) {
      console.error("Error al actualizar la contraseña:", updateError.message);
      process.exit(1);
    }
    console.log(`✓ Contraseña actualizada exitosamente.`);
  }
}

main().catch((err) => {
  console.error("Error inesperado:", err);
  process.exit(1);
});
