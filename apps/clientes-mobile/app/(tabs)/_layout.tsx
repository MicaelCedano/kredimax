import React from "react";
import { Platform, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import {
  CalendarCheck2,
  Home,
  ReceiptText,
  Smartphone,
  UserRound,
} from "lucide-react-native";
import { palette } from "../../src/theme/tokens";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.emerald,
        tabBarInactiveTintColor: "#64748B",
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Inicio",
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="financiamientos"
        options={{
          title: "Equipos",
          tabBarIcon: ({ color, size }) => <Smartphone size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cuotas"
        options={{
          title: "Cuotas",
          tabBarIcon: ({ color, size }) => (
            <CalendarCheck2 size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pagos"
        options={{
          title: "Pagos",
          tabBarIcon: ({ color, size }) => <ReceiptText size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, size }) => <UserRound size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: palette.white,
    borderTopWidth: 1,
    borderTopColor: palette.borderLight,
    height: Platform.OS === "ios" ? 84 : 66,
    paddingTop: 6,
    paddingBottom: Platform.OS === "ios" ? 24 : 10,
    elevation: 10,
    shadowColor: "#0B1730",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
});
