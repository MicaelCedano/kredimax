import React, { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Headphones,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react-native";
import { useAuth } from "../../src/context/auth-context";
import { usePortalData } from "../../src/hooks/use-portal-data";
import { DemoModeBanner } from "../../src/components/ui/kredimax-components";
import { updateCustomerPassword } from "../../src/services/api-client";
import { cardShadow, palette, radii, spacing } from "../../src/theme/tokens";
import {
  buildExecutiveWhatsAppPaymentUrl,
  validatePasswordAgainstCedula,
} from "../../src/utils/formatters";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Ingresa tu contraseña actual."),
    newPassword: z
      .string()
      .min(10, "La nueva contraseña debe tener mínimo 10 caracteres."),
    confirmPassword: z.string().min(1, "Confirma tu nueva contraseña."),
  })
  .refine((vals) => vals.newPassword === vals.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden.",
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export default function PerfilScreen() {
  const { session, signOut } = useAuth();
  const { customer, assignedExecutive, selectedLoan } = usePortalData();

  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onPasswordSubmit = async (values: ChangePasswordValues) => {
    if (!session) return;
    setFeedback(null);

    const check = validatePasswordAgainstCedula(
      values.newPassword,
      customer?.maskedCedula ?? session.maskedCedula,
    );
    if (!check.valid) {
      setFeedback({ type: "error", text: check.reason });
      return;
    }

    setSubmitting(true);
    try {
      const res = await updateCustomerPassword(session, {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      if (res.ok) {
        setFeedback({
          type: "success",
          text:
            session.mode === "DEMO"
              ? "Contraseña validada correctamente (Simulación en Modo DEMO)."
              : "Tu contraseña ha sido actualizada exitosamente.",
        });
        reset();
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const displayName = customer?.fullName ?? session?.customerName ?? "Cliente KrediMax";
  const maskedCedula = customer?.maskedCedula ?? session?.maskedCedula ?? "***-*******-*";
  const phone = customer?.phone ?? "No registrado";
  const email = customer?.email ?? null;
  const branchName = customer?.branchName ?? "Sucursal Principal KrediMax";

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {session?.mode === "DEMO" ? <DemoModeBanner onExitDemo={signOut} /> : null}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mi Perfil</Text>
        <Text style={styles.headerSubtitle}>
          Datos personales protegidos, seguridad y soporte al cliente
        </Text>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Customer Identity Card */}
        <View style={styles.card}>
          <View style={styles.avatarHeaderRow}>
            <View style={styles.avatarCircle}>
              <UserRound size={26} color={palette.white} />
            </View>
            <View style={styles.flexOne}>
              <Text style={styles.customerName}>{displayName}</Text>
              <View style={styles.cedulaBadge}>
                <ShieldCheck size={13} color={palette.emeraldDark} />
                <Text style={styles.cedulaBadgeText}>
                  Cédula protegida: {maskedCedula}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.infoList}>
            <View style={styles.infoRow}>
              <Phone size={16} color={palette.textMuted} />
              <Text style={styles.infoLabel}>Teléfono</Text>
              <Text style={styles.infoValue}>{phone}</Text>
            </View>

            <View style={styles.infoRow}>
              <Mail size={16} color={palette.textMuted} />
              <Text style={styles.infoLabel}>Correo electrónico</Text>
              <Text style={styles.infoValue}>{email ?? "No registrado"}</Text>
            </View>

            <View style={styles.infoRow}>
              <Building2 size={16} color={palette.textMuted} />
              <Text style={styles.infoLabel}>Sucursal asignada</Text>
              <Text style={styles.infoValue}>{branchName}</Text>
            </View>
          </View>
        </View>

        {/* Change Password Card */}
        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <KeyRound size={18} color={palette.navyPrimary} />
            <Text style={styles.sectionTitle}>Cambio de Contraseña</Text>
          </View>
          <Text style={styles.sectionDesc}>
            Por seguridad, nunca utilices los últimos 4 dígitos de tu cédula como
            contraseña.
          </Text>

          {feedback ? (
            <View
              style={[
                styles.feedbackBanner,
                feedback.type === "success"
                  ? { backgroundColor: palette.emeraldSoft }
                  : { backgroundColor: palette.dangerSoft },
              ]}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 size={16} color={palette.emeraldDark} />
              ) : (
                <AlertCircle size={16} color={palette.danger} />
              )}
              <Text
                style={[
                  styles.feedbackText,
                  {
                    color:
                      feedback.type === "success"
                        ? palette.emeraldDark
                        : palette.danger,
                  },
                ]}
              >
                {feedback.text}
              </Text>
            </View>
          ) : null}

          <Text style={styles.inputLabel}>Contraseña actual</Text>
          <Controller
            control={control}
            name="currentPassword"
            render={({ field: { onChange, value } }) => (
              <View style={styles.inputBox}>
                <Lock size={16} color={palette.textMuted} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Tu contraseña actual"
                  placeholderTextColor={palette.textMuted}
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                  value={value}
                  onChangeText={onChange}
                />
                <Pressable onPress={() => setShowPass((p) => !p)} hitSlop={8}>
                  {showPass ? (
                    <EyeOff size={17} color={palette.textMuted} />
                  ) : (
                    <Eye size={17} color={palette.textMuted} />
                  )}
                </Pressable>
              </View>
            )}
          />
          {errors.currentPassword ? (
            <Text style={styles.errorText}>{errors.currentPassword.message}</Text>
          ) : null}

          <Text style={[styles.inputLabel, { marginTop: spacing.md }]}>
            Nueva contraseña
          </Text>
          <Controller
            control={control}
            name="newPassword"
            render={({ field: { onChange, value } }) => (
              <View style={styles.inputBox}>
                <Lock size={16} color={palette.textMuted} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Mínimo 10 caracteres (Mayús, minús y número)"
                  placeholderTextColor={palette.textMuted}
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                  value={value}
                  onChangeText={onChange}
                />
              </View>
            )}
          />
          {errors.newPassword ? (
            <Text style={styles.errorText}>{errors.newPassword.message}</Text>
          ) : null}

          <Text style={[styles.inputLabel, { marginTop: spacing.md }]}>
            Confirmar nueva contraseña
          </Text>
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, value } }) => (
              <View style={styles.inputBox}>
                <Lock size={16} color={palette.textMuted} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Repite la nueva contraseña"
                  placeholderTextColor={palette.textMuted}
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                  value={value}
                  onChangeText={onChange}
                />
              </View>
            )}
          />
          {errors.confirmPassword ? (
            <Text style={styles.errorText}>{errors.confirmPassword.message}</Text>
          ) : null}

          <Pressable
            onPress={handleSubmit(onPasswordSubmit)}
            disabled={submitting}
            style={[styles.updatePassBtn, submitting && { opacity: 0.7 }]}
          >
            {submitting ? (
              <ActivityIndicator color={palette.white} />
            ) : (
              <Text style={styles.updatePassBtnText}>Actualizar Contraseña</Text>
            )}
          </Pressable>
        </View>

        {/* Support & Assigned Sales Executive Card */}
        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Headphones size={18} color={palette.emeraldDark} />
            <Text style={styles.sectionTitle}>
              Mi Ejecutivo de Venta Encargado
            </Text>
          </View>
          <Text style={styles.sectionDesc}>
            Para realizar pagos de tus cuotas, enviar comprobantes de transferencia o
            recibir asistencia personalizada, comunícate por WhatsApp con tu ejecutivo
            encargado:
          </Text>

          <View style={styles.execProfileBox}>
            <Text style={styles.execProfileName}>{assignedExecutive.name}</Text>
            <Text style={styles.execProfileRole}>
              {assignedExecutive.roleLabel} · WhatsApp {assignedExecutive.whatsappFormatted}
            </Text>
          </View>

          <Pressable
            onPress={() => {
              const url = buildExecutiveWhatsAppPaymentUrl({
                executiveName: assignedExecutive.name,
                executiveWhatsapp: assignedExecutive.whatsappPhone,
                customerName: displayName,
                maskedCedula,
                contractNumber: selectedLoan?.contractNumber ?? "Contrato KrediMax",
                deviceLabel: selectedLoan
                  ? `${selectedLoan.device.brand} ${selectedLoan.device.model}`
                  : "Equipo financiado",
                installmentSequence: selectedLoan?.nextInstallment?.sequence ?? null,
                amountFormatted:
                  selectedLoan?.nextInstallment?.balanceFormatted ??
                  selectedLoan?.pendingBalanceFormatted ??
                  "RD$0.00",
              });
              Linking.openURL(url).catch(() => {});
            }}
            style={styles.whatsappSupportBtn}
          >
            <MessageCircle size={18} color={palette.white} />
            <Text style={styles.whatsappSupportBtnText}>
              Pagar / Contactar por WhatsApp con {assignedExecutive.name}
            </Text>
          </Pressable>
        </View>

        {/* Sign Out Button */}
        <Pressable onPress={signOut} style={styles.logoutButton}>
          <LogOut size={18} color={palette.danger} />
          <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.navyPrimary,
  },
  flexOne: {
    flex: 1,
  },
  header: {
    backgroundColor: palette.navyPrimary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    color: palette.white,
    fontSize: 22,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: "#94A3B8",
    fontSize: 13,
    marginTop: 4,
  },
  scrollArea: {
    flex: 1,
    backgroundColor: palette.backgroundLight,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  card: {
    backgroundColor: palette.white,
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: palette.borderLight,
    ...cardShadow,
  },
  avatarHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSubtle,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: palette.navyPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  customerName: {
    fontSize: 18,
    fontWeight: "800",
    color: palette.textPrimary,
  },
  cedulaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
    backgroundColor: palette.emeraldSoft,
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  cedulaBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: palette.emeraldDark,
  },
  infoList: {
    marginTop: spacing.md,
    gap: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoLabel: {
    fontSize: 13,
    color: palette.textMuted,
    fontWeight: "600",
  },
  infoValue: {
    flex: 1,
    fontSize: 13,
    color: palette.textPrimary,
    fontWeight: "700",
    textAlign: "right",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: palette.textPrimary,
  },
  sectionDesc: {
    fontSize: 12,
    color: palette.textSecondary,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  feedbackText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: palette.backgroundLight,
    borderWidth: 1,
    borderColor: palette.borderLight,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    height: 46,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: palette.textPrimary,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 11,
    color: palette.danger,
    fontWeight: "600",
    marginTop: 4,
  },
  updatePassBtn: {
    marginTop: spacing.lg,
    backgroundColor: palette.navyPrimary,
    borderRadius: radii.md,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  updatePassBtnText: {
    color: palette.white,
    fontSize: 14,
    fontWeight: "800",
  },
  supportButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  supportActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: palette.borderLight,
    borderRadius: radii.md,
    paddingVertical: 12,
  },
  supportActionText: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.navyPrimary,
  },
  execProfileBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: palette.borderSubtle,
    marginBottom: spacing.md,
  },
  execProfileName: {
    fontSize: 15,
    fontWeight: "800",
    color: palette.navyPrimary,
  },
  execProfileRole: {
    fontSize: 12,
    color: palette.textSecondary,
    marginTop: 2,
  },
  whatsappSupportBtn: {
    backgroundColor: "#128C7E",
    borderRadius: radii.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  whatsappSupportBtnText: {
    color: palette.white,
    fontSize: 13,
    fontWeight: "800",
  },
  logoutButton: {
    backgroundColor: palette.dangerSoft,
    borderRadius: radii.lg,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  logoutButtonText: {
    color: palette.danger,
    fontSize: 14,
    fontWeight: "800",
  },
});
