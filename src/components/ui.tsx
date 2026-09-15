import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
// Purple and navy match the current TalentHunter website. Success stays green.
export const colors = {
  ink: "#0D102A",
  muted: "#626579",
  primary: "#9C00D9",
  paper: "#F7F7FA",
  border: "#DDDEEA",
  success: "#126C59",
  red: "#A52332",
};
export function Screen({ children }: PropsWithChildren) {
  // Shared safe-area, keyboard and scroll handling keeps forms usable on phones and web.
  // The navigation header already handles the top inset, so only other edges are included.
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.paper }}
      edges={["left", "right", "bottom"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.screen}
        >
          {__DEV__ && process.env.EXPO_PUBLIC_BACKEND === "local" && (
            <Text style={styles.localNotice}>
              Local development - data on this Mac
            </Text>
          )}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Title({ children }: PropsWithChildren) {
  // Expose section titles as headings as well as styling them visually.
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}
export function Body({ children }: PropsWithChildren) {
  // Shared typography avoids slightly different text sizes across screens.
  return <Text style={styles.body}>{children}</Text>;
}
export function Card({ children }: PropsWithChildren) {
  // Group related form fields or a single job/applicant without embedding business logic.
  return <View style={styles.card}>{children}</View>;
}
export function Message({
  children,
  error = false,
}: PropsWithChildren<{ error?: boolean }>) {
  // Empty messages occupy no space; live-region semantics announce updates where supported.
  if (!children) return null;
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[
        styles.message,
        error && { color: colors.red, backgroundColor: "#FBECEF" },
      ]}
    >
      {children}
    </Text>
  );
}
export function Loading() {
  // A labelled indicator is shared by all asynchronous data-loading screens.
  return (
    <View style={{ padding: 32 }}>
      <ActivityIndicator
        size="large"
        color={colors.primary}
        accessibilityLabel="Loading"
      />
    </View>
  );
}
export function Button({
  label,
  onPress,
  disabled,
  secondary,
  selected,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  selected?: boolean;
}) {
  // React Native Web does not translate accessibilityState into aria-pressed.
  // Use its keyboard-supported button role on web; native keeps radio semantics.
  const webSelection =
    Platform.OS === "web" && selected !== undefined
      ? { "aria-pressed": selected }
      : {};
  return (
    <Pressable
      {...webSelection}
      accessibilityRole={
        selected === undefined || Platform.OS === "web" ? "button" : "radio"
      }
      accessibilityState={{ disabled: !!disabled, checked: selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        (disabled || pressed) && { opacity: 0.55 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: colors.primary }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  // Visible/accessibility labels identify the field; stable test IDs help device automation.
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={`field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[
          styles.input,
          props.multiline && { minHeight: 130, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
// Central layout tokens keep the assessment consistent; controls have 48-point minimum height.
export const styles = StyleSheet.create({
  screen: {
    padding: 22,
    gap: 16,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingBottom: 48,
  },
  title: { fontSize: 28, fontWeight: "700", color: colors.ink, lineHeight: 35 },
  body: { fontSize: 16, lineHeight: 24, color: colors.muted },
  card: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: "#E2F0E7",
    padding: 12,
    borderRadius: 10,
    color: colors.success,
  },
  button: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.primary,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  localNotice: {
    color: "#653085",
    backgroundColor: "#F0E7F7",
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
  },
  secondary: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: { color: "white", fontWeight: "600", fontSize: 16 },
  label: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  input: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: "white",
    padding: 13,
    minHeight: 48,
    fontSize: 16,
    color: colors.ink,
  },
});
