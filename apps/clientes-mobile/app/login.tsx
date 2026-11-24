import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react-native";
import { useAuth } from "../src/context/auth-context";
import { KrediMaxLogo } from "../src/components/ui/kredimax-components";
import { requestPasswordRecovery } from "../src/services/api-client";
import { cardShadow, palette, radii, spacing } from "../src/theme/tokens";
import {
  formatCedulaInput,
  normalizeCedulaDigits,
  validatePasswordAgainstCedula,
} from "../src/utils/formatters";

const loginSchema = z.object({
  cedula: z
    .string()
    .min(1, "Ingresa tu número de cédula.")
    .refine((val) => normalizeCedulaDigits(val) !== null, {
      message: "Ingresa una cédula dominicana válida de 11 dígitos.",
    }),
  password: z
    .string()
    .min(6, "Ingresa tu contraseña (mínimo 6 caracteres)."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const firstPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(10, "La nueva contraseña debe tener al menos 10 caracteres."),
    confirmPassword: z.string().min(1, "Confirma tu nueva contraseña."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden.",
  });

type FirstPasswordFormValues = z.infer<typeof firstPasswordSchema>;

export default function LoginScreen() {
  const {
    session,
    enterDemoMode,
    signInWithCedula,
    completeFirstTimePasswordChange,
    signOut,
  } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Recovery Modal state
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const [recoveryCedula, setRecoveryCedula] = useState("");
  const [recoveryFeedback, setRecoveryFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // Biometric Preview Modal state
  const [biometricModalVisible, setBiometricModalVisible] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      cedula: "",
      password: "",
    },
  });

  const {
    control: passwordControl,
    handleSubmit: handleFirstPasswordSubmit,
    formState: { errors: passwordErrors },
  } = useForm<FirstPasswordFormValues>({
    resolver: zodResolver(firstPasswordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onLoginSubmit = async (values: LoginFormValues) => {
    setAuthError(null);
    setSubmitting(true);
    try {
      const result = await signInWithCedula(values.cedula, values.password);
      if (!result.ok) {
        setAuthError(result.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onFirstPasswordChange = async (values: FirstPasswordFormValues) => {
    setAuthError(null);
    const check = validatePasswordAgainstCedula(
      values.newPassword,
      session?.maskedCedula,
    );
    if (!check.valid) {
      setAuthError(check.reason);
      return;
    }

    setSubmitting(true);
    try {
      const result = await completeFirstTimePasswordChange(values.newPassword);
      if (!result.ok) {
        setAuthError(result.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecoveryRequest = async () => {
    setRecoveryFeedback(null);
    setRecoveryLoading(true);
    try {
      const res = await requestPasswordRecovery({ cedula: recoveryCedula });
      if (res.ok) {
        setRecoveryFeedback({ type: "success", text: res.message });
      } else {
        setRecoveryFeedback({ type: "error", text: res.message });
      }
    } finally {
      setRecoveryLoading(false);
    }
  };

  // Mandatory first-login password change view
  if (session?.mustChangePassword) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flexOne}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.brandHero}>
              <KrediMaxLogo size="md" light />
              <Text style={styles.heroTitle}>Cambio obligatorio de contraseña</Text>
              <Text style={styles.heroSubtitle}>
                Hola {session.customerName} ({session.maskedCedula}). Por tu seguridad, debes
                reemplazar la clave temporal asignada en sucursal antes de continuar.
              </Text>
            </View>

            <View style={styles.formCard}>
              <View style={styles.securityRuleBanner}>
                <ShieldCheck size={18} color={palette.emeraldDark} />
                <Text style={styles.securityRuleText}>
                  Regla de seguridad: Mínimo 10 caracteres con mayúsculas, minúsculas y números.
                  Nunca uses los últimos 4 dígitos de tu cédula.
                </Text>
              </View>

              {authError ? (
                <View style={styles.errorAlert}>
                  <AlertCircle size={18} color={palette.danger} />
                  <Text style={styles.errorAlertText}>{authError}</Text>
                </View>
              ) : null}

              <Text style={styles.inputLabel}>Nueva contraseña personal</Text>
              <Controller
                control={passwordControl}
                name="newPassword"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.inputWrapper}>
                    <Lock size={18} color={palette.textMuted} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Ej. KrediMax#2026Segura"
                      placeholderTextColor={palette.textMuted}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      value={value}
                      onChangeText={onChange}
                    />
                    <Pressable onPress={() => setShowPassword((prev) => !prev)} hitSlop={8}>
                      {showPassword ? (
                        <EyeOff size={18} color={palette.textMuted} />
                      ) : (
                        <Eye size={18} color={palette.textMuted} />
                      )}
                    </Pressable>
                  </View>
                )}
              />
              {passwordErrors.newPassword ? (
                <Text style={styles.fieldError}>{passwordErrors.newPassword.message}</Text>
              ) : null}

              <Text style={[styles.inputLabel, { marginTop: spacing.md }]}>
                Confirmar nueva contraseña
              </Text>
              <Controller
                control={passwordControl}
                name="confirmPassword"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.inputWrapper}>
                    <KeyRound size={18} color={palette.textMuted} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Repite tu nueva contraseña"
                      placeholderTextColor={palette.textMuted}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      value={value}
                      onChangeText={onChange}
                    />
                  </View>
                )}
              />
              {passwordErrors.confirmPassword ? (
                <Text style={styles.fieldError}>
                  {passwordErrors.confirmPassword.message}
                </Text>
              ) : null}

              <Pressable
                onPress={handleFirstPasswordSubmit(onFirstPasswordChange)}
                disabled={submitting}
                style={[styles.primaryButton, submitting && { opacity: 0.7 }]}
              >
                {submitting ? (
                  <ActivityIndicator color={palette.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Guardar contraseña y continuar
                  </Text>
                )}
              </Pressable>

              <Pressable onPress={signOut} style={styles.secondaryLinkBtn}>
                <Text style={styles.secondaryLinkText}>Cancelar y volver al inicio</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flexOne}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Navy Header */}
          <View style={styles.brandHero}>
            <KrediMaxLogo size="lg" light />
            <Text style={styles.heroTitle}>Tu financiamiento móvil, claro y al día</Text>
            <Text style={styles.heroSubtitle}>
              Consulta tu saldo pendiente, cronograma de cuotas y comprobantes oficiales en
              tiempo real.
            </Text>
          </View>

          {/* Main Login Card */}
          <View style={styles.formCard}>
            <Text style={styles.cardSectionTitle}>Acceso de Clientes</Text>

            {authError ? (
              <View style={styles.errorAlert}>
                <AlertCircle size={18} color={palette.danger} />
                <Text style={styles.errorAlertText}>{authError}</Text>
              </View>
            ) : null}

            <Text style={styles.inputLabel}>Número de Cédula</Text>
            <Controller
              control={control}
              name="cedula"
              render={({ field: { onChange, value } }) => (
                <View style={styles.inputWrapper}>
                  <UserCheck size={18} color={palette.textMuted} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="001-0000000-0"
                    placeholderTextColor={palette.textMuted}
                    keyboardType="number-pad"
                    maxLength={13}
                    value={value}
                    onChangeText={(text) => onChange(formatCedulaInput(text))}
                  />
                </View>
              )}
            />
            {errors.cedula ? (
              <Text style={styles.fieldError}>{errors.cedula.message}</Text>
            ) : null}

            <Text style={[styles.inputLabel, { marginTop: spacing.md }]}>Contraseña</Text>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value } }) => (
                <View style={styles.inputWrapper}>
                  <Lock size={18} color={palette.textMuted} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Ingresa tu contraseña"
                    placeholderTextColor={palette.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    value={value}
                    onChangeText={onChange}
                  />
                  <Pressable onPress={() => setShowPassword((prev) => !prev)} hitSlop={8}>
                    {showPassword ? (
                      <EyeOff size={18} color={palette.textMuted} />
                    ) : (
                      <Eye size={18} color={palette.textMuted} />
                    )}
                  </Pressable>
                </View>
              )}
            />
            {errors.password ? (
              <Text style={styles.fieldError}>{errors.password.message}</Text>
            ) : null}

            <View style={styles.recoveryRow}>
              <Pressable onPress={() => setRecoveryVisible(true)} hitSlop={8}>
                <Text style={styles.recoveryLink}>¿Olvidaste tu contraseña?</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleSubmit(onLoginSubmit)}
              disabled={submitting}
              style={[styles.primaryButton, submitting && { opacity: 0.7 }]}
            >
              {submitting ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Iniciar Sesión</Text>
              )}
            </Pressable>

            {/* Future Biometric Option */}
            <Pressable
              onPress={() => setBiometricModalVisible(true)}
              style={styles.biometricButton}
            >
              <Fingerprint size={19} color={palette.navyPrimary} />
              <Text style={styles.biometricButtonText}>
                Acceso Biométrico (Huella / Face ID)
              </Text>
              <View style={styles.soonBadge}>
                <Text style={styles.soonBadgeText}>PRÓXIMAMENTE</Text>
              </View>
            </Pressable>
          </View>

          {/* DEMO Mode Card */}
          <View style={styles.demoCard}>
            <View style={styles.demoHeaderRow}>
              <View style={styles.demoIconCircle}>
                <Sparkles size={18} color={palette.emerald} />
              </View>
              <View style={styles.flexOne}>
                <Text style={styles.demoCardTitle}>Modo Demostración Interactivo</Text>
                <Text style={styles.demoCardDesc}>
                  Explora todas las pantallas al instante con los datos de prueba de{" "}
                  <Text style={styles.boldText}>Juan Pérez (Samsung Galaxy A55)</Text> sin
                  necesidad de conexión a producción.
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => enterDemoMode({ simulateFirstLoginPasswordChange: false })}
              style={styles.demoEnterButton}
            >
              <Sparkles size={17} color={palette.white} />
              <Text style={styles.demoEnterButtonText}>
                Entrar en Modo DEMO (Juan Pérez)
              </Text>
            </Pressable>

            <Pressable
              onPress={() => enterDemoMode({ simulateFirstLoginPasswordChange: true })}
              style={styles.demoTempPassButton}
            >
              <KeyRound size={14} color={palette.blueSecondary} />
              <Text style={styles.demoTempPassText}>
                Simular primer ingreso con clave temporal aleatoria
              </Text>
            </Pressable>
          </View>

          <View style={styles.footerInfo}>
            <ShieldCheck size={15} color="#94A3B8" />
            <Text style={styles.footerInfoText}>
              Conexión cifrada · Tus datos están protegidos por KrediMax
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Password Recovery Modal */}
      <Modal
        visible={recoveryVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRecoveryVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Recuperación de Acceso</Text>
              <Pressable onPress={() => setRecoveryVisible(false)} hitSlop={8}>
                <X size={20} color={palette.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.modalDescription}>
              Ingresa tu número de cédula. Por seguridad financiera, un oficial de tu
              sucursal KrediMax generará una clave temporal aleatoria para ti.
            </Text>

            <View style={[styles.inputWrapper, { marginTop: spacing.md }]}>
              <UserCheck size={18} color={palette.textMuted} />
              <TextInput
                style={styles.textInput}
                placeholder="001-0000000-0"
                placeholderTextColor={palette.textMuted}
                keyboardType="number-pad"
                maxLength={13}
                value={recoveryCedula}
                onChangeText={(text) => setRecoveryCedula(formatCedulaInput(text))}
              />
            </View>

            {recoveryFeedback ? (
              <View
                style={[
                  styles.feedbackBanner,
                  recoveryFeedback.type === "success"
                    ? { backgroundColor: palette.emeraldSoft }
                    : { backgroundColor: palette.dangerSoft },
                ]}
              >
                {recoveryFeedback.type === "success" ? (
                  <CheckCircle2 size={16} color={palette.emeraldDark} />
                ) : (
                  <AlertCircle size={16} color={palette.danger} />
                )}
                <Text
                  style={[
                    styles.feedbackBannerText,
                    {
                      color:
                        recoveryFeedback.type === "success"
                          ? palette.emeraldDark
                          : palette.danger,
                    },
                  ]}
                >
                  {recoveryFeedback.text}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleRecoveryRequest}
              disabled={recoveryLoading}
              style={[styles.primaryButton, { marginTop: spacing.lg }]}
            >
              {recoveryLoading ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Solicitar Asistencia</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Future Biometrics Modal */}
      <Modal
        visible={biometricModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBiometricModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Biometría Bancaria</Text>
              <Pressable onPress={() => setBiometricModalVisible(false)} hitSlop={8}>
                <X size={20} color={palette.textSecondary} />
              </Pressable>
            </View>
            <View style={styles.biometricPreviewBox}>
              <Fingerprint size={42} color={palette.emerald} />
              <Text style={styles.biometricPreviewTitle}>
                Huella Digital y Reconocimiento Facial
              </Text>
              <Text style={styles.modalDescription}>
                Esta función estará disponible en la próxima actualización para que puedas
                desbloquear tu sesión guardada en SecureStore con un solo toque después de
                tu primer inicio de sesión.
              </Text>
            </View>
            <Pressable
              onPress={() => setBiometricModalVisible(false)}
              style={[styles.primaryButton, { marginTop: spacing.md }]}
            >
              <Text style={styles.primaryButtonText}>Entendido</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  brandHero: {
    marginBottom: spacing.xl,
  },
  heroTitle: {
    color: palette.white,
    fontSize: 22,
    fontWeight: "800",
    marginTop: spacing.lg,
    letterSpacing: -0.4,
  },
  heroSubtitle: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  formCard: {
    backgroundColor: palette.white,
    borderRadius: radii.xl,
    padding: spacing.xl,
    ...cardShadow,
  },
  cardSectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: palette.textPrimary,
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: palette.backgroundLight,
    borderWidth: 1,
    borderColor: palette.borderLight,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    height: 50,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: palette.textPrimary,
    fontWeight: "600",
  },
  fieldError: {
    color: palette.danger,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 5,
  },
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.dangerSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorAlertText: {
    flex: 1,
    color: palette.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  securityRuleBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: palette.emeraldSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  securityRuleText: {
    flex: 1,
    color: palette.emeraldDark,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  recoveryRow: {
    alignItems: "flex-end",
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  recoveryLink: {
    color: palette.blueSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  primaryButton: {
    backgroundColor: palette.navyPrimary,
    height: 52,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: palette.white,
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryLinkBtn: {
    marginTop: spacing.md,
    alignItems: "center",
    paddingVertical: 8,
  },
  secondaryLinkText: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  biometricButton: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.borderLight,
    backgroundColor: "#F8FAFC",
  },
  biometricButtonText: {
    color: palette.navyPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  soonBadge: {
    backgroundColor: palette.emeraldSoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  soonBadgeText: {
    color: palette.emeraldDark,
    fontSize: 9,
    fontWeight: "800",
  },
  demoCard: {
    marginTop: spacing.xl,
    backgroundColor: palette.blueSecondary,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(22, 160, 133, 0.45)",
  },
  demoHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  demoIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(22, 160, 133, 0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  demoCardTitle: {
    color: palette.white,
    fontSize: 15,
    fontWeight: "800",
  },
  demoCardDesc: {
    color: "#CBD5E1",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  boldText: {
    color: palette.white,
    fontWeight: "800",
  },
  demoEnterButton: {
    marginTop: spacing.md,
    backgroundColor: palette.emerald,
    height: 48,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  demoEnterButtonText: {
    color: palette.white,
    fontSize: 14,
    fontWeight: "800",
  },
  demoTempPassButton: {
    marginTop: 10,
    backgroundColor: palette.white,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  demoTempPassText: {
    color: palette.blueSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  footerInfo: {
    marginTop: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  footerInfoText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(11, 23, 48, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalBox: {
    width: "100%",
    backgroundColor: palette.white,
    borderRadius: radii.xl,
    padding: spacing.xl,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: palette.textPrimary,
  },
  modalDescription: {
    fontSize: 13,
    color: palette.textSecondary,
    lineHeight: 19,
  },
  feedbackBanner: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  feedbackBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  biometricPreviewBox: {
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: 10,
  },
  biometricPreviewTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: palette.navyPrimary,
    textAlign: "center",
  },
});
