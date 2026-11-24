import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../src/context/auth-context";
import { configureNotificationsChannelAsync } from "../src/services/notifications";
import { palette } from "../src/theme/tokens";

function RootNavigationGuard() {
  const { session, isHydrating } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    configureNotificationsChannelAsync();
  }, []);

  useEffect(() => {
    if (isHydrating) return;
    const inLoginScreen = segments[0] === "login";

    if (!session || session.mustChangePassword) {
      if (!inLoginScreen) {
        router.replace("/login");
      }
    } else if (inLoginScreen) {
      router.replace("/(tabs)");
    }
  }, [session, isHydrating, segments, router]);

  if (isHydrating) {
    return (
      <View style={styles.splashContainer}>
        <ActivityIndicator size="large" color={palette.emerald} />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" backgroundColor={palette.navyPrimary} />
          <RootNavigationGuard />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: palette.navyPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
});
