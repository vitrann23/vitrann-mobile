import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type KeyboardAwareScrollViewProps = ScrollViewProps & {
  children: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  extraBottomPadding?: number;
  keyboardVerticalOffset?: number;
};

export function KeyboardAwareScrollView({
  children,
  containerStyle,
  contentContainerStyle,
  extraBottomPadding = 24,
  keyboardVerticalOffset = 0,
  keyboardDismissMode,
  keyboardShouldPersistTaps,
  ...scrollViewProps
}: KeyboardAwareScrollViewProps) {
  const insets = useSafeAreaInsets();
  const flattenedContentStyle = StyleSheet.flatten(contentContainerStyle);
  const basePaddingBottom =
    typeof flattenedContentStyle?.paddingBottom === "number"
      ? flattenedContentStyle.paddingBottom
      : 0;

  return (
    <KeyboardAvoidingView
        style={[styles.container, containerStyle]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <ScrollView
        {...scrollViewProps}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode={
          keyboardDismissMode ?? (Platform.OS === "ios" ? "interactive" : "on-drag")
        }
        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? "handled"}
        contentContainerStyle={[
          contentContainerStyle,
          {
            paddingBottom:
              basePaddingBottom + insets.bottom + extraBottomPadding,
          },
        ]}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
