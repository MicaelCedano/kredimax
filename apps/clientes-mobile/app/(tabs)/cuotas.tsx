import React, { useMemo, useState } from "react";
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
import { CalendarCheck2, MessageCircle } from "lucide-react-native";
import { useAuth } from "../../src/context/auth-context";
import { usePortalData } from "../../src/hooks/use-portal-data";
import {
  DemoModeBanner,
  InstallmentStatusBadge,
  LoanSelectorBar,
  SkeletonLoaderCard,
} from "../../src/components/ui/kredimax-components";
import { cardShadow, palette, radii, spacing } from "../../src/theme/tokens";
import type { InstallmentItemDto, InstallmentStatus } from "../../src/types/portal";
import {
  buildExecutiveWhatsAppPaymentUrl,
  formatDominicanDate,
} from "../../src/utils/formatters";

type FilterOption = "all" | InstallmentStatus;

export default function CuotasScreen() {
  const { session, signOut } = useAuth();
  const {
    customer,
    assignedExecutive,
    loans,
    selectedLoan,
    setSelectedLoanId,
    installments,
    isLoading,
    isRefetching,
    refetch,
  } = usePortalData();

  const [filter, setFilter] = useState<FilterOption>("all");

  const handlePayInstallmentWhatsApp = (item: InstallmentItemDto) => {
    if (!selectedLoan) return;
    const url = buildExecutiveWhatsAppPaymentUrl({
      executiveName: assignedExecutive.name,
      executiveWhatsapp: assignedExecutive.whatsappPhone,
      customerName: customer?.fullName ?? session?.customerName ?? "Cliente KrediMax",
      maskedCedula: customer?.maskedCedula ?? session?.maskedCedula ?? "***-*******-*",
      contractNumber: selectedLoan.contractNumber,
      deviceLabel: `${selectedLoan.device.brand} ${selectedLoan.device.model}`,
      installmentSequence: item.sequence,
      dueDateFormatted: formatDominicanDate(item.dueDate, "medium"),
      amountFormatted: item.balanceFormatted,
    });
    Linking.openURL(url).catch(() => {});
  };

  const filteredInstallments = useMemo(() => {
    if (filter === "all") return installments;
    return installments.filter((item) => item.status === filter);
  }, [installments, filter]);

  const counts = useMemo(() => {
    return {
      all: installments.length,
      paid: installments.filter((i) => i.status === "paid").length,
      partial: installments.filter((i) => i.status === "partial").length,
      pending: installments.filter((i) => i.status === "pending").length,
      overdue: installments.filter((i) => i.status === "overdue").length,
    };
  }, [installments]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {session?.mode === "DEMO" ? <DemoModeBanner onExitDemo={signOut} /> : null}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mis Cuotas</Text>
        <Text style={styles.headerSubtitle}>
          Cronograma oficial sincronizado con el sistema financiero KrediMax
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
            <SkeletonLoaderCard lines={3} />
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

            {/* Summary Strip */}
            {selectedLoan ? (
              <View style={styles.summaryBanner}>
                <View>
                  <Text style={styles.summaryBannerLabel}>
                    {selectedLoan.device.brand} {selectedLoan.device.model}
                  </Text>
                  <Text style={styles.summaryBannerContract}>
                    Contrato {selectedLoan.contractNumber}
                  </Text>
                </View>
                <View style={styles.summaryRight}>
                  <Text style={styles.summaryBalanceLabel}>Saldo pendiente</Text>
                  <Text style={styles.summaryBalanceValue}>
                    {selectedLoan.pendingBalanceFormatted}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Filter Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {(
                [
                  { key: "all", label: `Todas (${counts.all})` },
                  { key: "overdue", label: `Vencidas (${counts.overdue})` },
                  { key: "partial", label: `Parciales (${counts.partial})` },
                  { key: "pending", label: `Pendientes (${counts.pending})` },
                  { key: "paid", label: `Pagadas (${counts.paid})` },
                ] as const
              ).map((tab) => {
                const active = filter === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setFilter(tab.key)}
                    style={[
                      styles.filterPill,
                      active ? styles.filterPillActive : styles.filterPillInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        { color: active ? palette.white : palette.textSecondary },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {filteredInstallments.length === 0 ? (
              <View style={styles.emptyCard}>
                <CalendarCheck2 size={34} color={palette.textMuted} />
                <Text style={styles.emptyTitle}>No hay cuotas en este filtro</Text>
                <Text style={styles.emptySubtitle}>
                  Selecciona otra categoría para visualizar el resto de tu cronograma.
                </Text>
              </View>
            ) : (
              filteredInstallments.map((item) => (
                <View
                  key={item.id}
                  style={[
                    styles.installmentCard,
                    item.status === "overdue" && styles.installmentCardOverdue,
                    item.status === "partial" && styles.installmentCardPartial,
                  ]}
                >
                  <View style={styles.cardTopRow}>
                    <View style={styles.sequenceRow}>
                      <View style={styles.sequenceCircle}>
                        <Text style={styles.sequenceNumberText}>#{item.sequence}</Text>
                      </View>
                      <View>
                        <Text style={styles.installmentTitle}>
                          Cuota N.º {item.sequence}
                        </Text>
                        <Text style={styles.dueDateText}>
                          Vence: {formatDominicanDate(item.dueDate, "medium")}
                        </Text>
                      </View>
                    </View>
                    <InstallmentStatusBadge status={item.status} />
                  </View>

                  <View style={styles.metricsGrid}>
                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>Importe</Text>
                      <Text style={styles.metricValue}>{item.amountDueFormatted}</Text>
                    </View>
                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>Abonado</Text>
                      <Text style={[styles.metricValue, { color: palette.emeraldDark }]}>
                        {item.amountPaidFormatted}
                      </Text>
                    </View>
                    <View style={[styles.metricCol, { alignItems: "flex-end" }]}>
                      <Text style={styles.metricLabel}>Saldo cuota</Text>
                      <Text
                        style={[
                          styles.metricValue,
                          {
                            color:
                              item.status === "overdue"
                                ? palette.danger
                                : palette.navyPrimary,
                          },
                        ]}
                      >
                        {item.balanceFormatted}
                      </Text>
                    </View>
                  </View>

                  {item.status !== "paid" ? (
                    <Pressable
                      onPress={() => handlePayInstallmentWhatsApp(item)}
                      style={styles.payInstallmentWhatsappBtn}
                    >
                      <MessageCircle size={15} color={palette.white} />
                      <Text style={styles.payInstallmentWhatsappText}>
                        Pagar Cuota #{item.sequence} ({item.balanceFormatted}) por WhatsApp con{" "}
                        {assignedExecutive.name}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))
            )}
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
  summaryBanner: {
    backgroundColor: palette.blueSecondary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  summaryBannerLabel: {
    color: palette.white,
    fontSize: 14,
    fontWeight: "800",
  },
  summaryBannerContract: {
    color: "#CBD5E1",
    fontSize: 12,
    marginTop: 2,
  },
  summaryRight: {
    alignItems: "flex-end",
  },
  summaryBalanceLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },
  summaryBalanceValue: {
    color: "#5EEAD4",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },
  filterRow: {
    gap: 8,
    marginBottom: spacing.lg,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  filterPillActive: {
    backgroundColor: palette.navyPrimary,
    borderColor: palette.navyPrimary,
  },
  filterPillInactive: {
    backgroundColor: palette.white,
    borderColor: palette.borderLight,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  installmentCard: {
    backgroundColor: palette.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: palette.borderLight,
    ...cardShadow,
  },
  installmentCardOverdue: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FFFDFD",
  },
  installmentCardPartial: {
    borderColor: "#93C5FD",
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  sequenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sequenceCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  sequenceNumberText: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.navyPrimary,
  },
  installmentTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: palette.textPrimary,
  },
  dueDateText: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.borderSubtle,
  },
  metricCol: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: palette.textMuted,
    fontWeight: "600",
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "800",
    color: palette.textPrimary,
    marginTop: 3,
  },
  payInstallmentWhatsappBtn: {
    marginTop: spacing.md,
    backgroundColor: "#128C7E",
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  payInstallmentWhatsappText: {
    color: palette.white,
    fontSize: 12,
    fontWeight: "800",
  },
  emptyCard: {
    backgroundColor: palette.white,
    borderRadius: radii.xl,
    padding: spacing.xxl,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: palette.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: palette.textSecondary,
    textAlign: "center",
  },
});
