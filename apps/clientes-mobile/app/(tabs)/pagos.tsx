import React, { useState } from "react";
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowRight,
  CheckCircle2,
  Edit3,
  FileCheck2,
  MessageCircle,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  UserCheck,
} from "lucide-react-native";
import { useAuth } from "../../src/context/auth-context";
import { usePortalData } from "../../src/hooks/use-portal-data";
import {
  AuthorizedReceiptModal,
  DemoModeBanner,
  LoanSelectorBar,
  SkeletonLoaderCard,
} from "../../src/components/ui/kredimax-components";
import { fetchAuthorizedReceipt } from "../../src/services/api-client";
import { cardShadow, heroShadow, palette, radii, spacing } from "../../src/theme/tokens";
import type { AuthorizedReceiptDocumentDto } from "../../src/types/portal";
import {
  buildExecutiveWhatsAppPaymentUrl,
  formatDominicanDate,
  formatDominicanDateTime,
  normalizeWhatsappPhone,
  translatePaymentMethod,
} from "../../src/utils/formatters";

export default function PagosScreen() {
  const { session, signOut } = useAuth();
  const {
    customer,
    assignedExecutive,
    setExecutiveOverride,
    loans,
    selectedLoan,
    setSelectedLoanId,
    allPayments,
    isLoading,
    isRefetching,
    refetch,
  } = usePortalData();

  const [editingExec, setEditingExec] = useState(false);
  const [execNameInput, setExecNameInput] = useState(assignedExecutive.name);
  const [execPhoneInput, setExecPhoneInput] = useState(
    assignedExecutive.whatsappFormatted,
  );

  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] =
    useState<AuthorizedReceiptDocumentDto | null>(null);

  const handleSaveExecutiveOverride = () => {
    const cleanPhone = normalizeWhatsappPhone(execPhoneInput);
    setExecutiveOverride({
      name: execNameInput.trim() || "Ejecutivo KrediMax",
      roleLabel: "Ejecutivo de Venta Encargado",
      whatsappPhone: cleanPhone,
      whatsappFormatted: execPhoneInput.trim() || `+${cleanPhone}`,
    });
    setEditingExec(false);
  };

  const handlePayNextInstallmentWhatsApp = () => {
    if (!selectedLoan) return;
    const url = buildExecutiveWhatsAppPaymentUrl({
      executiveName: assignedExecutive.name,
      executiveWhatsapp: assignedExecutive.whatsappPhone,
      customerName: customer?.fullName ?? session?.customerName ?? "Cliente KrediMax",
      maskedCedula: customer?.maskedCedula ?? session?.maskedCedula ?? "***-*******-*",
      contractNumber: selectedLoan.contractNumber,
      deviceLabel: `${selectedLoan.device.brand} ${selectedLoan.device.model}`,
      installmentSequence: selectedLoan.nextInstallment?.sequence ?? null,
      dueDateFormatted: selectedLoan.nextInstallment
        ? formatDominicanDate(selectedLoan.nextInstallment.dueDate, "medium")
        : null,
      amountFormatted:
        selectedLoan.nextInstallment?.balanceFormatted ??
        selectedLoan.pendingBalanceFormatted,
    });
    Linking.openURL(url).catch(() => {});
  };

  const handleSendVoucherWhatsApp = () => {
    if (!selectedLoan) return;
    const url = buildExecutiveWhatsAppPaymentUrl({
      executiveName: assignedExecutive.name,
      executiveWhatsapp: assignedExecutive.whatsappPhone,
      customerName: customer?.fullName ?? session?.customerName ?? "Cliente KrediMax",
      maskedCedula: customer?.maskedCedula ?? session?.maskedCedula ?? "***-*******-*",
      contractNumber: selectedLoan.contractNumber,
      deviceLabel: `${selectedLoan.device.brand} ${selectedLoan.device.model}`,
      installmentSequence: null,
      amountFormatted:
        selectedLoan.nextInstallment?.amountDueFormatted ??
        selectedLoan.pendingBalanceFormatted,
      conceptLabel: "Envío de comprobante de pago / transferencia",
    });
    Linking.openURL(url).catch(() => {});
  };

  const handleOpenReceipt = async (paymentId: string) => {
    if (!session) return;
    setReceiptModalVisible(true);
    setReceiptLoading(true);
    setReceiptError(null);
    setSelectedReceipt(null);

    try {
      const doc = await fetchAuthorizedReceipt(session, paymentId);
      setSelectedReceipt(doc);
    } catch (err) {
      setReceiptError(
        err instanceof Error
          ? err.message
          : "No se pudo obtener el comprobante autorizado.",
      );
    } finally {
      setReceiptLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {session?.mode === "DEMO" ? <DemoModeBanner onExitDemo={signOut} /> : null}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pagos y Comprobantes</Text>
        <Text style={styles.headerSubtitle}>
          Realiza tus pagos directamente por WhatsApp con tu ejecutivo de venta encargado
        </Text>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={palette.emerald}
          />
        }
      >
        {isLoading ? (
          <>
            <SkeletonLoaderCard lines={3} />
            <SkeletonLoaderCard lines={3} />
          </>
        ) : (
          <>
            {selectedLoan ? (
              <LoanSelectorBar
                loans={loans}
                selectedLoanId={selectedLoan.id}
                onSelect={setSelectedLoanId}
              />
            ) : null}

            {/* Primary Card: Pagar por WhatsApp con Ejecutivo de Venta Encargado */}
            <View style={styles.executiveHeroCard}>
              <View style={styles.execTopRow}>
                <View style={styles.execAvatar}>
                  <UserCheck size={22} color={palette.white} />
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.execRoleBadge}>
                    {assignedExecutive.roleLabel.toUpperCase()}
                  </Text>
                  <Text style={styles.execName}>{assignedExecutive.name}</Text>
                  <Text style={styles.execWhatsapp}>
                    WhatsApp asignado: {assignedExecutive.whatsappFormatted}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setExecNameInput(assignedExecutive.name);
                    setExecPhoneInput(assignedExecutive.whatsappFormatted);
                    setEditingExec((prev) => !prev);
                  }}
                  style={styles.editExecBtn}
                  hitSlop={8}
                >
                  <Edit3 size={14} color="#5EEAD4" />
                  <Text style={styles.editExecBtnText}>
                    {editingExec ? "Cerrar" : "Cambiar"}
                  </Text>
                </Pressable>
              </View>

              {editingExec ? (
                <View style={styles.editExecBox}>
                  <Text style={styles.editExecTitle}>
                    Personalizar Ejecutivo de Venta (Prueba en vivo de WhatsApp)
                  </Text>
                  <TextInput
                    style={styles.editExecInput}
                    value={execNameInput}
                    onChangeText={setExecNameInput}
                    placeholder="Nombre del Ejecutivo"
                    placeholderTextColor="#94A3B8"
                  />
                  <TextInput
                    style={[styles.editExecInput, { marginTop: 8 }]}
                    value={execPhoneInput}
                    onChangeText={setExecPhoneInput}
                    keyboardType="phone-pad"
                    placeholder="Número WhatsApp (ej. 809-555-0188)"
                    placeholderTextColor="#94A3B8"
                  />
                  <Pressable
                    onPress={handleSaveExecutiveOverride}
                    style={styles.saveExecBtn}
                  >
                    <Text style={styles.saveExecBtnText}>
                      Guardar WhatsApp del Ejecutivo
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <Text style={styles.execExplanation}>
                Todos los pagos y comprobantes de transferencia se gestionan directamente
                por WhatsApp con tu ejecutivo de venta encargado para aplicarse de
                inmediato a tu contrato.
              </Text>

              {selectedLoan ? (
                <View style={styles.whatsappActionsBox}>
                  <Pressable
                    onPress={handlePayNextInstallmentWhatsApp}
                    style={styles.whatsappPrimaryBtn}
                  >
                    <MessageCircle size={20} color={palette.white} />
                    <View style={styles.flexOne}>
                      <Text style={styles.whatsappPrimaryTitle}>
                        {selectedLoan.nextInstallment
                          ? `Pagar Cuota #${selectedLoan.nextInstallment.sequence} (${selectedLoan.nextInstallment.balanceFormatted}) por WhatsApp`
                          : `Coordinar Pago por WhatsApp (${selectedLoan.pendingBalanceFormatted})`}
                      </Text>
                      <Text style={styles.whatsappPrimarySub}>
                        Abrir chat con {assignedExecutive.name} · {selectedLoan.contractNumber}
                      </Text>
                    </View>
                    <ArrowRight size={18} color={palette.white} />
                  </Pressable>

                  <Pressable
                    onPress={handleSendVoucherWhatsApp}
                    style={styles.whatsappSecondaryBtn}
                  >
                    <MessageCircle size={16} color="#5EEAD4" />
                    <Text style={styles.whatsappSecondaryText}>
                      Enviar comprobante de transferencia a {assignedExecutive.name}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <Text style={styles.historySectionTitle}>
              HISTORIAL DE PAGOS REGISTRADOS
            </Text>

            {allPayments.length === 0 ? (
              <View style={styles.emptyCard}>
                <ReceiptText size={36} color={palette.textMuted} />
                <Text style={styles.emptyTitle}>Sin pagos registrados aún</Text>
                <Text style={styles.emptySubtitle}>
                  Usa el botón superior de WhatsApp para realizar tu pago con tu ejecutivo
                  de venta encargado.
                </Text>
              </View>
            ) : (
              allPayments.map((payment) => {
                const confirmed = payment.status === "confirmed";
                return (
                  <View key={payment.id} style={styles.paymentCard}>
                    <View style={styles.topRow}>
                      <View>
                        <Text style={styles.paymentAmount}>
                          {payment.amountFormatted}
                        </Text>
                        <Text style={styles.paymentDate}>
                          {formatDominicanDateTime(payment.receivedAt)}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: confirmed
                              ? palette.emeraldSoft
                              : palette.dangerSoft,
                          },
                        ]}
                      >
                        {confirmed ? (
                          <CheckCircle2 size={13} color={palette.emeraldDark} />
                        ) : (
                          <RotateCcw size={13} color={palette.danger} />
                        )}
                        <Text
                          style={[
                            styles.statusBadgeText,
                            {
                              color: confirmed ? palette.emeraldDark : palette.danger,
                            },
                          ]}
                        >
                          {confirmed ? "Confirmado" : "Reversado"}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.detailsBox}>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Financiamiento</Text>
                        <Text style={styles.detailValue}>
                          {payment.contractNumber} · {payment.deviceName}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Referencia</Text>
                        <Text style={styles.detailValue}>{payment.reference}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Método</Text>
                        <Text style={styles.detailValue}>
                          {translatePaymentMethod(payment.paymentMethod)}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Recibo N.º</Text>
                        <Text style={styles.detailValue}>{payment.receiptNumber}</Text>
                      </View>
                    </View>

                    {payment.receiptAvailable && confirmed ? (
                      <Pressable
                        onPress={() => handleOpenReceipt(payment.id)}
                        style={styles.receiptButton}
                      >
                        <FileCheck2 size={16} color={palette.emeraldDark} />
                        <Text style={styles.receiptButtonText}>
                          Ver y descargar recibo autorizado
                        </Text>
                      </Pressable>
                    ) : (
                      <View style={styles.unavailableReceiptBox}>
                        <Text style={styles.unavailableReceiptText}>
                          Recibo no disponible para este movimiento
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}

            <View style={styles.securityNote}>
              <ShieldCheck size={15} color={palette.textMuted} />
              <Text style={styles.securityNoteText}>
                Solo se emiten recibos oficiales verificados y autorizados por el
                servidor KrediMax.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <AuthorizedReceiptModal
        visible={receiptModalVisible}
        loading={receiptLoading}
        error={receiptError}
        receipt={selectedReceipt}
        onClose={() => setReceiptModalVisible(false)}
      />
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
  executiveHeroCard: {
    backgroundColor: palette.navyPrimary,
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(22, 160, 133, 0.45)",
    ...heroShadow,
  },
  execTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  execAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#128C7E",
    alignItems: "center",
    justifyContent: "center",
  },
  execRoleBadge: {
    color: "#5EEAD4",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  execName: {
    color: palette.white,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },
  execWhatsapp: {
    color: "#CBD5E1",
    fontSize: 12,
    marginTop: 2,
  },
  editExecBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(22, 160, 133, 0.18)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "rgba(22, 160, 133, 0.4)",
  },
  editExecBtnText: {
    color: "#5EEAD4",
    fontSize: 11,
    fontWeight: "700",
  },
  editExecBox: {
    marginTop: spacing.md,
    backgroundColor: palette.blueSecondary,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  editExecTitle: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  editExecInput: {
    backgroundColor: palette.navyPrimary,
    color: palette.white,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  saveExecBtn: {
    marginTop: 10,
    backgroundColor: palette.emerald,
    borderRadius: radii.sm,
    paddingVertical: 10,
    alignItems: "center",
  },
  saveExecBtnText: {
    color: palette.white,
    fontSize: 12,
    fontWeight: "800",
  },
  execExplanation: {
    color: "#CBD5E1",
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  whatsappActionsBox: {
    marginTop: spacing.lg,
    gap: 10,
  },
  whatsappPrimaryBtn: {
    backgroundColor: "#128C7E",
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  whatsappPrimaryTitle: {
    color: palette.white,
    fontSize: 14,
    fontWeight: "800",
  },
  whatsappPrimarySub: {
    color: "#E2F8F5",
    fontSize: 11,
    marginTop: 2,
  },
  whatsappSecondaryBtn: {
    backgroundColor: "rgba(22, 160, 133, 0.16)",
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(22, 160, 133, 0.4)",
  },
  whatsappSecondaryText: {
    color: "#5EEAD4",
    fontSize: 12,
    fontWeight: "700",
  },
  historySectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.textSecondary,
    letterSpacing: 0.7,
    marginBottom: spacing.md,
  },
  paymentCard: {
    backgroundColor: palette.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: palette.borderLight,
    ...cardShadow,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  paymentAmount: {
    fontSize: 21,
    fontWeight: "800",
    color: palette.navyPrimary,
  },
  paymentDate: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  detailsBox: {
    borderTopWidth: 1,
    borderTopColor: palette.borderSubtle,
    paddingTop: spacing.sm,
    gap: 6,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  detailLabel: {
    fontSize: 12,
    color: palette.textMuted,
    fontWeight: "600",
  },
  detailValue: {
    fontSize: 12,
    color: palette.textPrimary,
    fontWeight: "700",
    flex: 1,
    textAlign: "right",
  },
  receiptButton: {
    marginTop: spacing.md,
    backgroundColor: palette.emeraldSoft,
    borderRadius: radii.md,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(22, 160, 133, 0.3)",
  },
  receiptButtonText: {
    color: palette.emeraldDark,
    fontSize: 13,
    fontWeight: "800",
  },
  unavailableReceiptBox: {
    marginTop: spacing.md,
    backgroundColor: "#F8FAFC",
    borderRadius: radii.md,
    paddingVertical: 9,
    alignItems: "center",
  },
  unavailableReceiptText: {
    fontSize: 12,
    color: palette.textMuted,
    fontWeight: "600",
  },
  emptyCard: {
    backgroundColor: palette.white,
    borderRadius: radii.xl,
    padding: spacing.xxl,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: palette.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: palette.textSecondary,
    textAlign: "center",
  },
  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.sm,
  },
  securityNoteText: {
    fontSize: 11,
    color: palette.textMuted,
    fontWeight: "600",
    textAlign: "center",
    flex: 1,
  },
});
