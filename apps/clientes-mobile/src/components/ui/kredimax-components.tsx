import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck2,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react-native";
import { cardShadow, palette, radii, spacing } from "../../theme/tokens";
import type {
  AuthorizedReceiptDocumentDto,
  CustomerLoanSummaryDto,
  DeviceImageCategory,
  InstallmentStatus,
} from "../../types/portal";
import {
  formatDominicanDate,
  formatDominicanDateTime,
  translatePaymentMethod,
} from "../../utils/formatters";

/**
 * KrediMax Brand Logo (Crest + Wordmark)
 */
export function KrediMaxLogo({
  size = "md",
  light = true,
}: {
  size?: "sm" | "md" | "lg";
  light?: boolean;
}) {
  const badgeSize = size === "lg" ? 56 : size === "md" ? 42 : 34;
  const titleSize = size === "lg" ? 26 : size === "md" ? 20 : 17;

  return (
    <View style={styles.logoRow}>
      <View
        style={[
          styles.logoCrest,
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize * 0.3,
          },
        ]}
      >
        <Text style={[styles.logoCrestText, { fontSize: badgeSize * 0.46 }]}>K</Text>
        <View style={styles.logoEmeraldDot} />
      </View>
      <View>
        <View style={styles.wordmarkRow}>
          <Text
            style={[
              styles.wordmarkPrimary,
              {
                fontSize: titleSize,
                color: light ? palette.white : palette.navyPrimary,
              },
            ]}
          >
            Kredi
          </Text>
          <Text style={[styles.wordmarkAccent, { fontSize: titleSize }]}>Max</Text>
        </View>
        <Text
          style={[
            styles.wordmarkSub,
            { color: light ? "#94A3B8" : palette.textMuted },
          ]}
        >
          CLIENTES · REPÚBLICA DOMINICANA
        </Text>
      </View>
    </View>
  );
}

/**
 * Clearly identifies when the app is running in DEMO mode with illustrative data.
 */
export function DemoModeBanner({ onExitDemo }: { onExitDemo?: () => void }) {
  return (
    <View style={styles.demoBanner}>
      <View style={styles.demoBannerLeft}>
        <Sparkles size={15} color={palette.demoAmber} />
        <Text style={styles.demoBannerText}>
          MODO DEMO · Datos demostrativos (Juan Pérez)
        </Text>
      </View>
      {onExitDemo ? (
        <Pressable onPress={onExitDemo} hitSlop={8} style={styles.demoBannerAction}>
          <Text style={styles.demoBannerActionText}>Cambiar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Animated financial progress bar.
 */
export function FinancialProgressBar({
  percent,
  height = 10,
  trackColor = "rgba(255,255,255,0.16)",
  fillColor = palette.emerald,
}: {
  percent: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: clamped,
      duration: 550,
      useNativeDriver: false,
    }).start();
  }, [animWidth, clamped]);

  const widthInterpolated = animWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View
      style={[
        styles.progressTrack,
        { height, backgroundColor: trackColor, borderRadius: height / 2 },
      ]}
    >
      <Animated.View
        style={[
          styles.progressFill,
          {
            width: widthInterpolated,
            height,
            backgroundColor: fillColor,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
}

/**
 * Visual status badge for installments (`pagada`, `parcial`, `pendiente`, `vencida`).
 */
export function InstallmentStatusBadge({ status }: { status: InstallmentStatus }) {
  const config: Record<
    InstallmentStatus,
    { label: string; bg: string; text: string; Icon: typeof CheckCircle2 }
  > = {
    paid: {
      label: "Pagada",
      bg: palette.emeraldSoft,
      text: palette.emeraldDark,
      Icon: CheckCircle2,
    },
    partial: {
      label: "Parcial",
      bg: palette.infoSoft,
      text: palette.info,
      Icon: Clock,
    },
    pending: {
      label: "Pendiente",
      bg: palette.warningSoft,
      text: palette.warning,
      Icon: Clock,
    },
    overdue: {
      label: "Vencida",
      bg: palette.dangerSoft,
      text: palette.danger,
      Icon: AlertTriangle,
    },
  };

  const current = config[status] ?? config.pending;
  const IconComp = current.Icon;

  return (
    <View style={[styles.badge, { backgroundColor: current.bg }]}>
      <IconComp size={13} color={current.text} />
      <Text style={[styles.badgeText, { color: current.text }]}>{current.label}</Text>
    </View>
  );
}

/**
 * Skeleton loading card for network/query transitions.
 */
export function SkeletonLoaderCard({ lines = 3 }: { lines?: number }) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.skeletonCard, { opacity }]}>
      <View style={[styles.skeletonLine, { width: "45%", height: 14 }]} />
      <View style={[styles.skeletonLine, { width: "75%", height: 24, marginTop: 10 }]} />
      {Array.from({ length: lines }).map((_, idx) => (
        <View
          key={idx}
          style={[
            styles.skeletonLine,
            { width: idx === lines - 1 ? "60%" : "92%", height: 12, marginTop: 10 },
          ]}
        />
      ))}
    </Animated.View>
  );
}

/**
 * Vector Smartphone Illustration for Financed Devices.
 */
export function DeviceIllustration({
  category,
  brand,
  model,
}: {
  category: DeviceImageCategory;
  brand: string;
  model: string;
}) {
  const accentColor =
    category === "samsung"
      ? "#16A085"
      : category === "iphone"
        ? "#2563EB"
        : category === "xiaomi"
          ? "#EA580C"
          : "#172B4D";

  return (
    <View style={styles.deviceVisualBox}>
      <View style={[styles.devicePhoneFrame, { borderColor: accentColor }]}>
        <View style={styles.deviceCameraNotch} />
        <View style={[styles.deviceScreenGlow, { backgroundColor: `${accentColor}18` }]}>
          <Smartphone size={28} color={accentColor} />
          <Text style={[styles.deviceScreenBrand, { color: palette.navyPrimary }]}>
            {brand}
          </Text>
          <Text style={styles.deviceScreen5G}>5G · KREDIMAX</Text>
        </View>
        <View style={styles.deviceHomeBar} />
      </View>
      <View style={styles.deviceBadgeRow}>
        <ShieldCheck size={13} color={palette.emerald} />
        <Text style={styles.deviceVerifiedText} numberOfLines={1}>
          Equipo verificado · {model}
        </Text>
      </View>
    </View>
  );
}

/**
 * Selector bar when a customer has multiple financings.
 */
export function LoanSelectorBar({
  loans,
  selectedLoanId,
  onSelect,
}: {
  loans: CustomerLoanSummaryDto[];
  selectedLoanId: string;
  onSelect: (loanId: string) => void;
}) {
  if (loans.length <= 1) return null;

  return (
    <View style={styles.selectorContainer}>
      <Text style={styles.selectorLabel}>Seleccionar financiamiento:</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.selectorScroll}
      >
        {loans.map((loan) => {
          const active = loan.id === selectedLoanId;
          return (
            <Pressable
              key={loan.id}
              onPress={() => onSelect(loan.id)}
              style={[
                styles.selectorPill,
                active ? styles.selectorPillActive : styles.selectorPillInactive,
              ]}
            >
              <Smartphone
                size={14}
                color={active ? palette.white : palette.navyPrimary}
              />
              <View>
                <Text
                  style={[
                    styles.selectorPillTitle,
                    { color: active ? palette.white : palette.navyPrimary },
                  ]}
                >
                  {loan.device.brand} {loan.device.model}
                </Text>
                <Text
                  style={[
                    styles.selectorPillSub,
                    { color: active ? "#CBD5E1" : palette.textMuted },
                  ]}
                >
                  {loan.contractNumber} · {loan.statusLabel}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * Authorized Official Payment Receipt Viewer & Share Modal.
 */
export function AuthorizedReceiptModal({
  visible,
  loading,
  error,
  receipt,
  onClose,
}: {
  visible: boolean;
  loading: boolean;
  error: string | null;
  receipt: AuthorizedReceiptDocumentDto | null;
  onClose: () => void;
}) {
  const handleShareReceipt = async () => {
    if (!receipt) return;
    const text = [
      `COMPROBANTE OFICIAL DE PAGO — ${receipt.companyName}`,
      `Recibo N.º: ${receipt.receiptNumber}`,
      `Fecha: ${formatDominicanDateTime(receipt.issuedAt)}`,
      `Cliente: ${receipt.customerName} (${receipt.customerMaskedCedula})`,
      `Contrato: ${receipt.contractNumber}`,
      `Equipo: ${receipt.deviceDescription}`,
      `Monto Pagado: ${receipt.amountFormatted}`,
      `Método: ${translatePaymentMethod(receipt.paymentMethod)}`,
      `Referencia: ${receipt.reference}`,
      `Código de Verificación: ${receipt.verificationHash}`,
    ].join("\n");

    try {
      await Share.share({
        title: `Recibo KrediMax ${receipt.receiptNumber}`,
        message: text,
      });
    } catch {
      // User dismissed share sheet
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderTitleRow}>
              <FileCheck2 size={20} color={palette.emerald} />
              <Text style={styles.modalTitle}>Comprobante de Pago</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <X size={20} color={palette.textSecondary} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.modalCenterBox}>
              <ActivityIndicator size="large" color={palette.emerald} />
              <Text style={styles.modalLoadingText}>
                Verificando comprobante autorizado...
              </Text>
            </View>
          ) : error ? (
            <View style={styles.modalCenterBox}>
              <AlertTriangle size={32} color={palette.danger} />
              <Text style={styles.modalErrorText}>{error}</Text>
            </View>
          ) : receipt ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.receiptPaper}>
                <View style={styles.receiptTopBanner}>
                  <Text style={styles.receiptCompany}>{receipt.companyName}</Text>
                  <Text style={styles.receiptBranch}>
                    {receipt.branchName} · RNC {receipt.companyRnc}
                  </Text>
                  <View style={styles.receiptVerifiedPill}>
                    <CheckCircle2 size={13} color={palette.emerald} />
                    <Text style={styles.receiptVerifiedPillText}>
                      RECIBO AUTORIZADO · {receipt.receiptNumber}
                    </Text>
                  </View>
                </View>

                <View style={styles.receiptAmountBox}>
                  <Text style={styles.receiptAmountLabel}>MONTO RECIBIDO</Text>
                  <Text style={styles.receiptAmountValue}>{receipt.amountFormatted}</Text>
                  <Text style={styles.receiptDateText}>
                    {formatDominicanDateTime(receipt.issuedAt)}
                  </Text>
                </View>

                <View style={styles.receiptDivider} />

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptKey}>Cliente</Text>
                  <Text style={styles.receiptVal}>{receipt.customerName}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptKey}>Cédula</Text>
                  <Text style={styles.receiptVal}>{receipt.customerMaskedCedula}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptKey}>Contrato</Text>
                  <Text style={styles.receiptVal}>{receipt.contractNumber}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptKey}>Equipo</Text>
                  <Text style={styles.receiptVal}>{receipt.deviceDescription}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptKey}>Método de pago</Text>
                  <Text style={styles.receiptVal}>
                    {translatePaymentMethod(receipt.paymentMethod)}
                  </Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptKey}>Referencia</Text>
                  <Text style={styles.receiptVal}>{receipt.reference}</Text>
                </View>

                {receipt.allocations.length > 0 ? (
                  <>
                    <View style={styles.receiptDivider} />
                    <Text style={styles.receiptSectionTitle}>APLICACIÓN A CUOTAS</Text>
                    {receipt.allocations.map((alloc) => (
                      <View key={alloc.sequence} style={styles.receiptRow}>
                        <Text style={styles.receiptKey}>
                          Cuota #{alloc.sequence} ({formatDominicanDate(alloc.dueDate, "short")})
                        </Text>
                        <Text style={styles.receiptVal}>{alloc.allocatedFormatted}</Text>
                      </View>
                    ))}
                  </>
                ) : null}

                <View style={styles.receiptDivider} />
                <Text style={styles.receiptHashText}>
                  Sello digital: {receipt.verificationHash}
                </Text>
              </View>

              <Pressable onPress={handleShareReceipt} style={styles.shareBtn}>
                <Share2 size={18} color={palette.white} />
                <Text style={styles.shareBtnText}>Compartir / Guardar Comprobante</Text>
              </Pressable>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoCrest: {
    backgroundColor: palette.blueSecondary,
    borderWidth: 1.5,
    borderColor: palette.emerald,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  logoCrestText: {
    color: palette.white,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  logoEmeraldDot: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.emerald,
  },
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  wordmarkPrimary: {
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  wordmarkAccent: {
    fontWeight: "800",
    color: palette.emerald,
    letterSpacing: -0.5,
  },
  wordmarkSub: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
    marginTop: 1,
  },
  demoBanner: {
    backgroundColor: palette.demoAmberBg,
    borderBottomWidth: 1,
    borderBottomColor: palette.demoAmberBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  demoBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  demoBannerText: {
    color: palette.demoAmber,
    fontSize: 12,
    fontWeight: "700",
  },
  demoBannerAction: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: palette.demoAmberBorder,
  },
  demoBannerActionText: {
    color: palette.demoAmber,
    fontSize: 11,
    fontWeight: "700",
  },
  progressTrack: {
    width: "100%",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  skeletonCard: {
    backgroundColor: palette.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: palette.borderLight,
  },
  skeletonLine: {
    backgroundColor: "#E2E8F0",
    borderRadius: 6,
  },
  deviceVisualBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    backgroundColor: "#F8FAFC",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.borderLight,
  },
  devicePhoneFrame: {
    width: 104,
    height: 168,
    borderRadius: 20,
    borderWidth: 2.5,
    backgroundColor: palette.white,
    padding: 6,
    justifyContent: "space-between",
    alignItems: "center",
    ...cardShadow,
  },
  deviceCameraNotch: {
    width: 24,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.navyPrimary,
    marginTop: 2,
  },
  deviceScreenGlow: {
    width: "100%",
    flex: 1,
    marginVertical: 6,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  deviceScreenBrand: {
    fontSize: 12,
    fontWeight: "800",
    marginTop: 6,
    textAlign: "center",
  },
  deviceScreen5G: {
    fontSize: 9,
    fontWeight: "700",
    color: palette.textMuted,
    marginTop: 2,
  },
  deviceHomeBar: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginBottom: 2,
  },
  deviceBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 12,
  },
  deviceVerifiedText: {
    fontSize: 12,
    fontWeight: "600",
    color: palette.textSecondary,
  },
  selectorContainer: {
    marginBottom: spacing.lg,
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.textSecondary,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectorScroll: {
    gap: 10,
  },
  selectorPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  selectorPillActive: {
    backgroundColor: palette.navyPrimary,
    borderColor: palette.navyPrimary,
  },
  selectorPillInactive: {
    backgroundColor: palette.white,
    borderColor: palette.borderLight,
  },
  selectorPillTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  selectorPillSub: {
    fontSize: 11,
    marginTop: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 23, 48, 0.65)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: palette.backgroundLight,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    padding: spacing.xl,
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  modalHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: palette.textPrimary,
  },
  closeBtn: {
    padding: 6,
    borderRadius: radii.pill,
    backgroundColor: palette.white,
  },
  modalCenterBox: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  modalLoadingText: {
    fontSize: 14,
    color: palette.textSecondary,
    fontWeight: "600",
  },
  modalErrorText: {
    fontSize: 14,
    color: palette.danger,
    textAlign: "center",
    fontWeight: "600",
  },
  receiptPaper: {
    backgroundColor: palette.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.borderLight,
    ...cardShadow,
  },
  receiptTopBanner: {
    alignItems: "center",
    marginBottom: spacing.md,
  },
  receiptCompany: {
    fontSize: 16,
    fontWeight: "800",
    color: palette.navyPrimary,
  },
  receiptBranch: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 2,
  },
  receiptVerifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: palette.emeraldSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginTop: 8,
  },
  receiptVerifiedPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: palette.emeraldDark,
  },
  receiptAmountBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.borderSubtle,
  },
  receiptAmountLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.textMuted,
    letterSpacing: 0.8,
  },
  receiptAmountValue: {
    fontSize: 26,
    fontWeight: "800",
    color: palette.navyPrimary,
    marginTop: 4,
  },
  receiptDateText: {
    fontSize: 12,
    color: palette.textSecondary,
    marginTop: 4,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: palette.borderLight,
    marginVertical: spacing.md,
  },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 5,
    gap: 12,
  },
  receiptKey: {
    fontSize: 13,
    color: palette.textMuted,
    fontWeight: "500",
  },
  receiptVal: {
    fontSize: 13,
    color: palette.textPrimary,
    fontWeight: "700",
    textAlign: "right",
    flex: 1,
  },
  receiptSectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: palette.textMuted,
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  receiptHashText: {
    fontSize: 11,
    color: palette.textMuted,
    textAlign: "center",
    fontFamily: "monospace",
  },
  shareBtn: {
    marginTop: spacing.lg,
    backgroundColor: palette.emerald,
    borderRadius: radii.md,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  shareBtnText: {
    color: palette.white,
    fontSize: 15,
    fontWeight: "800",
  },
});
