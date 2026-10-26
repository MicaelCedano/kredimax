import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({access:vi.fn(),server:vi.fn(),admin:vi.fn(),verifier:vi.fn(),redirect:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/security/tenant-access",()=>({getTenantAccess:mocks.access}));
vi.mock("@/lib/supabase/server",()=>({createSupabaseServerClient:mocks.server}));
vi.mock("@/lib/supabase/admin",()=>({createSupabaseAdminClient:mocks.admin,isUserProvisioningConfigured:()=>true}));
vi.mock("@supabase/supabase-js",()=>({createClient:mocks.verifier}));
import { createTenantUser, changeOwnPassword, updateOwnProfile } from "@/modules/account/actions";

const branchId="10000000-0000-4000-8000-000000000001";
const newUser="10000000-0000-4000-8000-000000000002";
function userForm(role="sales") {const form=new FormData();for(const [key,value] of Object.entries({fullName:"Vendedor de prueba",email:"qa@example.test",password:"Test-only-password-123",confirmation:"Test-only-password-123",role,branchId}))form.set(key,value);return form;}
function passwordForm(current="Current-test-pass",confirmation="New-test-pass-123") {const form=new FormData();form.set("currentPassword",current);form.set("password","New-test-pass-123");form.set("confirmation",confirmation);return form;}

describe("Account actions authorization",()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.redirect.mockImplementation((path:string)=>{throw Error("REDIRECT:"+path);});process.env.NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:24642";process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="test";});
 it("rejects sellers before touching privileged APIs",async()=>{mocks.access.mockResolvedValue({ok:true,membership:{role:"sales"}});expect((await createTenantUser(null,userForm()))?.state).toBe("forbidden");expect(mocks.admin).not.toHaveBeenCalled();});
 it("does not provision administrator or platform roles through account creation",async()=>{mocks.access.mockResolvedValue({ok:true,membership:{role:"tenant_admin"}});expect((await createTenantUser(null,userForm("tenant_admin")))?.state).toBe("invalid-user");expect(mocks.admin).not.toHaveBeenCalled();});
 it("rejects a foreign or inactive branch before creating Auth users",async()=>{const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),maybeSingle:vi.fn().mockResolvedValue({data:null,error:null})};mocks.access.mockResolvedValue({ok:true,userId:"actor",membership:{role:"tenant_admin",tenant_id:"tenant"},supabase:{from:()=>q}});expect((await createTenantUser(null,userForm()))?.state).toBe("invalid-branch");expect(mocks.admin).not.toHaveBeenCalled();});
 it("creates a new account and assigns only the trusted actor and tenant",async()=>{const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),maybeSingle:vi.fn().mockResolvedValue({data:{id:branchId},error:null})};const createUser=vi.fn().mockResolvedValue({data:{user:{id:newUser}},error:null}),rpc=vi.fn().mockResolvedValue({data:"membership",error:null});mocks.access.mockResolvedValue({ok:true,userId:"actor",membership:{role:"tenant_admin",tenant_id:"tenant"},supabase:{from:()=>q}});mocks.admin.mockReturnValue({auth:{admin:{createUser}},rpc});const form=userForm();form.set("tenantId","attacker");await expect(createTenantUser(null,form)).rejects.toThrow("REDIRECT:/usuarios?estado=creado");expect(rpc).toHaveBeenCalledWith("provision_tenant_user",expect.objectContaining({p_actor_id:"actor",p_tenant_id:"tenant",p_role:"sales",p_branch_id:branchId}));expect(createUser.mock.calls[0][0].user_metadata).toEqual({full_name:"Vendedor de prueba"});});
 it("requires matching new passwords before any Auth call",async()=>{expect((await changeOwnPassword(null,passwordForm("old","different")))?.state).toBe("invalid-password");expect(mocks.server).not.toHaveBeenCalled();});
 it("does not update a password if the current password is incorrect",async()=>{const updateUser=vi.fn(),signOut=vi.fn();mocks.server.mockResolvedValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:"self",email:"self@example.test"}},error:null})}});mocks.verifier.mockReturnValue({auth:{signInWithPassword:vi.fn().mockResolvedValue({error:{status:400}}),updateUser,signOut}});expect((await changeOwnPassword(null,passwordForm()))?.state).toBe("current-password-invalid");expect(updateUser).not.toHaveBeenCalled();expect(signOut).toHaveBeenCalledWith({scope:"local"});});
 it("updates only the display name, ignoring submitted role metadata",async()=>{const updateUser=vi.fn().mockResolvedValue({error:null});mocks.server.mockResolvedValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:"self"}},error:null}),updateUser}});const form=new FormData();form.set("fullName","Mi nombre");form.set("role","tenant_admin");await expect(updateOwnProfile(null,form)).rejects.toThrow("REDIRECT:/perfil?estado=actualizado");expect(updateUser).toHaveBeenCalledWith({data:{full_name:"Mi nombre"}});});
});
