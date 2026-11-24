import React from "react";
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  UserCheck,
} from "lucide-react-native";
import { useAuth } from "../../src/context/auth-context";
import { usePortalData } from "../../src/hooks/use-portal-data";
import {
  DemoModeBanner,
  FinancialProgressBar,
  KrediMaxLogo,
  LoanSelectorBar,
  SkeletonLoaderCard,
} from "../../src/components/ui/kredimax-components";
import { cardShadow, heroShadow, palette, radii, spacing } from "../../src/theme/tokens";
import {
  buildExecutiveWhatsAppPaymentUrl,
  formatDominicanDate,
  getDominicanGreeting,
} from "../../src/utils/formatters";

export default function HomeScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const {
    customer,
    assignedExecutive,
    loans,
    selectedLoan,
    setSelectedLoanId,
    isLoading,
    isRefetching,
    refetch,
  } = usePortalData();

  const greeting = getDominicanGreeting();

  const handlePayViaWhatsApp = () => {
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

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {session?.mode === "DEMO" ? <DemoModeBanner onExitDemo={signOut} /> : null}

      {/* Top Banking Bar */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.greetingText}>{greeting},</Text>
          <Text style={styles.customerNameText}>
            {customer?.fullName ?? session?.customerName ?? "Cliente KrediMax"}
          </Text>
        </View>
        <KrediMaxLogo size="sm" light />
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
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
            <SkeletonLoaderCard lines={4} />
            <SkeletonLoaderCard lines={3} />
          </>
        ) : !selectedLoan ? (
          <View style={styles.emptyCard}>
            <Smartphone size={36} color={palette.textMuted} />
            <Text style={styles.emptyTitle}>Sin financiamientos activos</Text>
            <Text style={styles.emptySubtitle}>
              Aún no tienes financiamientos registrados bajo tu expediente.
            </Text>
          </View>
        ) : (
          <>
            {/* Selector when customer has multiple financings */}
            <LoanSelectorBar
              loans={loans}
              selectedLoanId={selectedLoan.id}
              onSelect={setSelectedLoanId}
            />

            {/* Main Balance Hero Card */}
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View>
                  <Text style={styles.heroLabel}>SALDO PENDIENTE</Text>
                  <Text style={styles.heroBalanceValue}>
                    {selectedLoan.pendingBalanceFormatted}
                  </Text>
                </View>
                <View style={styles.statusPill}>
                  <CheckCircle2 size={13} color={palette.emerald} />
                  <Text style={styles.statusPillText}>{selectedLoan.statusLabel}</Text>
                </View>
              </View>

              {/* Progress Section */}
              <View style={styles.progressSection}>
                <View style={styles.progressHeaderRow}>
                  <Text style={styles.progressLabel}>Progreso de pago</Text>
                  <Text style={styles.progressPercentText}>
                    {selectedLoan.progressPercent}% pagado
                  </Text>
                </View>
                <FinancialProgressBar percent={selectedLoan.progressPercent} height={10} />
              </View>

              {/* Total Financed vs Total Paid */}
              <View style={styles.heroMetricsGrid}>
                <View style={styles.heroMetricItem}>
                  <Text style={styles.heroMetricLabel}>Total financiado</Text>
                  <Text style={styles.heroMetricValue}>
                    {selectedLoan.totalFinancedFormatted}
                  </Text>
                </View>
                <View style={styles.heroMetricDivider} />
                <View style={styles.heroMetricItem}>
                  <Text style={styles.heroMetricLabel}>Total abonado</Text>
                  <Text style={[styles.heroMetricValue, { color: "#5EEAD4" }]}>
                    {selectedLoan.totalPaidFormatted}
                  </Text>
                </View>
              </View>
            </View>

            {/* Next Installment Card */}
            <View style={styles.sectionCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.iconBadge}>
                  <CalendarClock size={20} color={palette.emerald} />
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>Próxima cuota programada</Text>
                  <Text style={styles.cardSubtitle}>
                    {selectedLoan.nextInstallment
                      ? `Cuota #${selectedLoan.nextInstallment.sequence} de ${selectedLoan.installmentCount}`
                      : "Todas las cuotas están saldadas"}
                  </Text>
                </View>
                <Pressable
                  onPress={() => router.push("/(tabs)/cuotas")}
                  style={styles.linkPill}
                >
                  <Text style={styles.linkPillText}>Ver cuotas</Text>
                  <ArrowRight size={13} color={palette.emeraldDark} />
                </Pressable>
              </View>

              {selectedLoan.nextInstallment ? (
                <>
                  <View style={styles.nextInstallmentBox}>
                    <View>
                      <Text style={styles.nextInstMetaLabel}>Importe de la cuota</Text>
                      <Text style={styles.nextInstAmount}>
                        {selectedLoan.nextInstallment.amountDueFormatted}
                      </Text>
                      {selectedLoan.nextInstallment.balance !==
                      selectedLoan.nextInstallment.amountDue ? (
                        <Text style={styles.nextInstRemainingNote}>
                          Restante por cubrir:{" "}
                          {selectedLoan.nextInstallment.balanceFormatted}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.dueDateRightBox}>
                      <Text style={styles.nextInstMetaLabel}>Fecha de vencimiento</Text>
                      <Text style={styles.nextInstDateValue}>
                        {formatDominicanDate(selectedLoan.nextInstallment.dueDate, "medium")}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={handlePayViaWhatsApp}
                    style={styles.whatsappPayBtn}
                  >
                    <MessageCircle size={18} color={palette.white} />
                    <View style={styles.flexOne}>
                      <Text style={styles.whatsappPayBtnTitle}>
                        Pagar por WhatsApp con Ejecutivo de Venta
                      </Text>
                      <Text style={styles.whatsappPayBtnSub}>
                        Redirige a {assignedExecutive.name} ({assignedExecutive.whatsappFormatted})
                      </Text>
                    </View>
                    <ArrowRight size={16} color={palette.white} />
                  </Pressable>
                </>
              ) : (
                <View style={styles.paidOffBanner}>
                  <CheckCircle2 size={18} color={palette.emeraldDark} />
                  <Text style={styles.paidOffBannerText}>
                    Este financiamiento ha sido completado satisfactoriamente.
                  </Text>
                </View>
              )}
            </View>

            {/* Financed Device Summary Card */}
            <View style={styles.sectionCard}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.iconBadge, { backgroundColor: "#EFF6FF" }]}>
                  <Smartphone size={20} color={palette.blueSecondary} />
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>Equipo financiado</Text>
                  <Text style={styles.cardSubtitle}>
                    Contrato {selectedLoan.contractNumber}
                  </Text>
                </View>
                <Pressable
                  onPress={() => router.push("/(tabs)/financiamientos")}
                  style={styles.linkPill}
                >
                  <Text style={styles.linkPillText}>Detalles</Text>
                  <ArrowRight size={13} color={palette.emeraldDark} />
                </Pressable>
              </View>

              <View style={styles.deviceSummaryBox}>
                <View style={styles.flexOne}>
                  <Text style={styles.deviceBrandModel}>
                    {selectedLoan.device.brand} {selectedLoan.device.model}
                  </Text>
                  <Text style={styles.deviceMetaLine}>
                    IMEI registrado: {selectedLoan.device.imeiMasked}
                  </Text>
                  <Text style={styles.deviceMetaLine}>
                    Cuotas pagadas: {selectedLoan.paidInstallmentsCount} de{" "}
                    {selectedLoan.installmentCount}
                  </Text>
                </View>
              </View>
            </View>

            {/* Quick Shortcuts */}
            <View style={styles.shortcutsRow}>
              <Pressable
                onPress={() => router.push("/(tabs)/cuotas")}
                style={styles.shortcutCard}
              >
                <TrendingUp size={20} color={palette.emerald} />
                <Text style={styles.shortcutTitle}>Cronograma</Text>
                <Text style={styles.shortcutDesc}>Estado de mis cuotas</Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/(tabs)/pagos")}
                style={styles.shortcutCard}
              >
                <CreditCard size={20} color={palette.blueSecondary} />
                <Text style={styles.shortcutTitle}>Mis Recibos</Text>
                <Text style={styles.shortcutDesc}>Comprobantes de pago</Text>
              </Pressable>
            </View>

            <View style={styles.securityFooter}>
              <ShieldCheck size={15} color={palette.textMuted} />
              <Text style={styles.securityFooterText}>
                Cálculos sincronizados con el sistema financiero KrediMax · Moneda RD$
              </Text>
            </View>
          </>
        )}
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
  topHeader: {
    backgroundColor: palette.navyPrimary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  greetingText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },
  customerNameText: {
    color: palette.white,
    fontSize: 21,
    fontWeight: "800",
    marginTop: 2,
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
  heroCard: {
    backgroundColor: palette.navyPrimary,
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: palette.blueSecondary,
    ...heroShadow,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  heroLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroBalanceValue: {
    color: palette.white,
    fontSize: 30,
    fontWeight: "800",
    marginTop: 4,
    letterSpacing: -0.6,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(22, 160, 133, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(22, 160, 133, 0.45)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  statusPillText: {
    color: "#5EEAD4",
    fontSize: 11,
    fontWeight: "800",
  },
  progressSection: {
    marginTop: spacing.xl,
  },
  progressHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressLabel: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "600",
  },
  progressPercentText: {
    color: "#5EEAD4",
    fontSize: 13,
    fontWeight: "800",
  },
  heroMetricsGrid: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    alignItems: "center",
  },
  heroMetricItem: {
    flex: 1,
  },
  heroMetricDivider: {
    width: 1,
    height: 34,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginHorizontal: spacing.md,
  },
  heroMetricLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
  },
  heroMetricValue: {
    color: palette.white,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 3,
  },
  sectionCard: {
    backgroundColor: palette.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: palette.borderLight,
    ...cardShadow,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: palette.emeraldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: palette.textPrimary,
  },
  cardSubtitle: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 2,
  },
  linkPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: palette.emeraldSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  linkPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.emeraldDark,
  },
  nextInstallmentBox: {
    marginTop: spacing.md,
    backgroundColor: palette.backgroundLight,
    borderRadius: radii.lg,
    padding: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.borderSubtle,
  },
  nextInstMetaLabel: {
    fontSize: 11,
    color: palette.textMuted,
    fontWeight: "600",
  },
  nextInstAmount: {
    fontSize: 20,
    fontWeight: "800",
    color: palette.navyPrimary,
    marginTop: 2,
  },
  nextInstRemainingNote: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.emeraldDark,
    marginTop: 3,
  },
  dueDateRightBox: {
    alignItems: "flex-end",
  },
  nextInstDateValue: {
    fontSize: 14,
    fontWeight: "800",
    color: palette.textPrimary,
    marginTop: 4,
  },
  paidOffBanner: {
    marginTop: spacing.md,
    backgroundColor: palette.emeraldSoft,
    padding: spacing.md,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  paidOffBannerText: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.emeraldDark,
    flex: 1,
  },
  whatsappPayBtn: {
    marginTop: spacing.md,
    backgroundColor: "#128C7E",
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  whatsappPayBtnTitle: {
    color: palette.white,
    fontSize: 13,
    fontWeight: "800",
  },
  whatsappPayBtnSub: {
    color: "#E2F8F5",
    fontSize: 11,
    marginTop: 1,
  },
  deviceSummaryBox: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
  },
  deviceBrandModel: {
    fontSize: 16,
    fontWeight: "800",
    color: palette.navyPrimary,
  },
  deviceMetaLine: {
    fontSize: 12,
    color: palette.textSecondary,
    marginTop: 4,
  },
  shortcutsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  shortcutCard: {
    flex: 1,
    backgroundColor: palette.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.borderLight,
    ...cardShadow,
  },
  shortcutTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: palette.textPrimary,
    marginTop: 10,
  },
  shortcutDesc: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 2,
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
  securityFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.sm,
  },
  securityFooterText: {
    fontSize: 11,
    color: palette.textMuted,
    fontWeight: "600",
  },
});
