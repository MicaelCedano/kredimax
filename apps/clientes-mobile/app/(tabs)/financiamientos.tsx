import React from "react";
import {
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
  CalendarCheck2,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Smartphone,
} from "lucide-react-native";
import { useAuth } from "../../src/context/auth-context";
import { usePortalData } from "../../src/hooks/use-portal-data";
import {
  DemoModeBanner,
  DeviceIllustration,
  FinancialProgressBar,
  LoanSelectorBar,
  SkeletonLoaderCard,
} from "../../src/components/ui/kredimax-components";
import { cardShadow, palette, radii, spacing } from "../../src/theme/tokens";
import { formatDominicanDate } from "../../src/utils/formatters";

export default function FinanciamientosScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const {
    loans,
    selectedLoan,
    setSelectedLoanId,
    isLoading,
    isRefetching,
    refetch,
  } = usePortalData();

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {session?.mode === "DEMO" ? <DemoModeBanner onExitDemo={signOut} /> : null}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mis Financiamientos</Text>
        <Text style={styles.headerSubtitle}>
          Detalle contractual y financiero de tus equipos adquiridos en KrediMax
        </Text>
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
            <SkeletonLoaderCard lines={5} />
            <SkeletonLoaderCard lines={4} />
          </>
        ) : !selectedLoan ? (
          <View style={styles.emptyCard}>
            <Smartphone size={36} color={palette.textMuted} />
            <Text style={styles.emptyTitle}>No tienes equipos financiados</Text>
            <Text style={styles.emptySubtitle}>
              Cuando actives un financiamiento en sucursal, aparecerá aquí con su
              contrato y desglose.
            </Text>
          </View>
        ) : (
          <>
            <LoanSelectorBar
              loans={loans}
              selectedLoanId={selectedLoan.id}
              onSelect={setSelectedLoanId}
            />

            {/* Main Device & Contract Card */}
            <View style={styles.mainCard}>
              <View style={styles.contractHeaderRow}>
                <View style={styles.contractNumberPill}>
                  <FileText size={14} color={palette.navyPrimary} />
                  <Text style={styles.contractNumberText}>
                    Contrato {selectedLoan.contractNumber}
                  </Text>
                </View>
                <View style={styles.loanStatusBadge}>
                  <CheckCircle2 size={13} color={palette.emeraldDark} />
                  <Text style={styles.loanStatusText}>{selectedLoan.statusLabel}</Text>
                </View>
              </View>

              {/* Illustrative Device Visual */}
              <View style={styles.illustrationWrapper}>
                <DeviceIllustration
                  category={selectedLoan.device.imageCategory}
                  brand={selectedLoan.device.brand}
                  model={selectedLoan.device.model}
                />
              </View>

              <Text style={styles.deviceTitle}>
                {selectedLoan.device.brand} {selectedLoan.device.model}
              </Text>
              <Text style={styles.deviceImei}>
                IMEI registrado: {selectedLoan.device.imeiMasked}
              </Text>

              {/* Progress Bar */}
              <View style={styles.progressBox}>
                <View style={styles.progressRow}>
                  <Text style={styles.progressText}>
                    Avance del préstamo ({selectedLoan.paidInstallmentsCount}/
                    {selectedLoan.installmentCount} cuotas pagadas)
                  </Text>
                  <Text style={styles.progressPct}>{selectedLoan.progressPercent}%</Text>
                </View>
                <FinancialProgressBar
                  percent={selectedLoan.progressPercent}
                  height={9}
                  trackColor="#E2E8F0"
                  fillColor={palette.emerald}
                />
              </View>

              {/* Financial Breakdown Table */}
              <View style={styles.breakdownContainer}>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Precio del equipo</Text>
                  <Text style={styles.breakdownValue}>
                    {selectedLoan.salePriceFormatted}
                  </Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Inicial pagada</Text>
                  <Text style={styles.breakdownValue}>
                    {selectedLoan.downPaymentFormatted}
                  </Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Monto financiado</Text>
                  <Text style={styles.breakdownValue}>
                    {selectedLoan.totalFinancedFormatted}
                  </Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Total abonado a cuotas</Text>
                  <Text style={[styles.breakdownValue, { color: palette.emeraldDark }]}>
                    {selectedLoan.totalPaidFormatted}
                  </Text>
                </View>

                <View style={[styles.breakdownRow, styles.highlightRow]}>
                  <Text style={styles.highlightLabel}>Saldo pendiente</Text>
                  <Text style={styles.highlightValue}>
                    {selectedLoan.pendingBalanceFormatted}
                  </Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Fecha del contrato</Text>
                  <Text style={styles.breakdownValue}>
                    {formatDominicanDate(selectedLoan.contractSignedAt, "long")}
                  </Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Estado del préstamo</Text>
                  <Text style={styles.breakdownValue}>{selectedLoan.statusLabel}</Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Número de contrato</Text>
                  <Text style={styles.breakdownValue}>{selectedLoan.contractNumber}</Text>
                </View>
              </View>

              <Pressable
                onPress={() => router.push("/(tabs)/cuotas")}
                style={styles.ctaButton}
              >
                <CalendarCheck2 size={18} color={palette.white} />
                <Text style={styles.ctaButtonText}>
                  Consultar cronograma de este financiamiento
                </Text>
              </Pressable>
            </View>

            <View style={styles.privacyNotice}>
              <ShieldCheck size={16} color={palette.emeraldDark} />
              <Text style={styles.privacyNoticeText}>
                Información privada vinculada exclusivamente a tu expediente autenticado en
                KrediMax.
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
  mainCard: {
    backgroundColor: palette.white,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: palette.borderLight,
    ...cardShadow,
  },
  contractHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  contractNumberPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  contractNumberText: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.navyPrimary,
  },
  loanStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: palette.emeraldSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  loanStatusText: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.emeraldDark,
  },
  illustrationWrapper: {
    marginVertical: spacing.md,
  },
  deviceTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: palette.navyPrimary,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  deviceImei: {
    fontSize: 12,
    color: palette.textMuted,
    textAlign: "center",
    marginTop: 4,
  },
  progressBox: {
    marginTop: spacing.lg,
    backgroundColor: "#F8FAFC",
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.borderSubtle,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "600",
    color: palette.textSecondary,
  },
  progressPct: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.emeraldDark,
  },
  breakdownContainer: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: palette.borderLight,
    paddingTop: spacing.sm,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSubtle,
  },
  breakdownLabel: {
    fontSize: 13,
    color: palette.textSecondary,
    fontWeight: "500",
  },
  breakdownValue: {
    fontSize: 14,
    color: palette.textPrimary,
    fontWeight: "700",
  },
  highlightRow: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    marginVertical: 4,
  },
  highlightLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: palette.navyPrimary,
  },
  highlightValue: {
    fontSize: 16,
    fontWeight: "800",
    color: palette.navyPrimary,
  },
  ctaButton: {
    marginTop: spacing.xl,
    backgroundColor: palette.navyPrimary,
    borderRadius: radii.md,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaButtonText: {
    color: palette.white,
    fontSize: 14,
    fontWeight: "800",
  },
  privacyNotice: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.sm,
  },
  privacyNoticeText: {
    flex: 1,
    fontSize: 12,
    color: palette.textSecondary,
    lineHeight: 17,
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
});
