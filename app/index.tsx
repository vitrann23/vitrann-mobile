import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import Toast from "react-native-toast-message";
import apiClient from "../services/apiClient";

interface WorkerLoginResponse {
  success: boolean;
  message: string;
  token: string;
  userType: string;
  worker: {
    workerId: number;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    role: string;
    isActive: boolean;
  };
}

export default function Index() {
  const router = useRouter();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    checkLoggedInStatus();
  }, []);

  const checkLoggedInStatus = async () => {
    try {
      let token;

      if (Platform.OS === "web") {
        token = await AsyncStorage.getItem("authToken");
      } else {
        token = await SecureStore.getItemAsync("authToken");
      }

      const workerId = await AsyncStorage.getItem("workerId");

      if (token && workerId) {
        router.replace({
          pathname: "/MorningStockScreen",
          params: { workerId },
        });
      }
    } catch (e) {
      console.error("Failed to check login status", e);
    }
  };

  const handleLogin = async () => {
    if (!phoneNumber.trim()) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Please enter your phone number",
      });
      return;
    }

    if (phoneNumber.length !== 10) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Phone number must be 10 digits",
      });
      return;
    }

    if (!password.trim()) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Please enter your password",
      });
      return;
    }

    setIsLoading(true);

    try {
      const data = (await apiClient.post<WorkerLoginResponse>(
          "/auth/worker-login",
          {
            phoneNumber: phoneNumber.trim(),
            password,
          },
      )) as unknown as WorkerLoginResponse;

      if (data.success === true && data.token && data.worker) {
        if (Platform.OS === "web") {
          await AsyncStorage.setItem(
              "authToken",
              data.token,
          );
        } else {
          await SecureStore.setItemAsync(
              "authToken",
              data.token,
          );
        }

        await AsyncStorage.setItem(
            "userType",
            data.userType,
        );

        await AsyncStorage.setItem(
            "workerId",
            data.worker.workerId.toString(),
        );

        await AsyncStorage.setItem(
            "workerName",
            `${data.worker.firstName} ${data.worker.lastName}`,
        );

        Toast.show({
          type: "success",
          text1: "Login Successful",
          text2: `Welcome, ${data.worker.firstName}!`,
        });

        setTimeout(() => {
          router.replace({
            pathname: "/MorningStockScreen",
            params: {
              workerId: data.worker.workerId,
            },
          });
        }, 1200);
      } else {
        Toast.show({
          type: "error",
          text1: "Login Failed",
          text2:
              data.message ||
              "Invalid phone number or password",
        });
      }
    } catch (error: any) {
      console.error(error);

      Toast.show({
        type: "error",
        text1: "Login Failed",
        text2:
            error.message ||
            "Unable to connect to server. Please check your internet connection.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isLoginDisabled =
      phoneNumber.length !== 10 ||
      !password.trim() ||
      isLoading;

  return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar
            barStyle="dark-content"
            backgroundColor="#FFFFFF"
        />

        <KeyboardAvoidingView
            style={styles.keyboardContainer}
            behavior={
              Platform.OS === "ios"
                  ? "padding"
                  : "height"
            }
        >
          <View style={styles.innerContainer}>
            <View style={styles.logoSection}>
              <Image
                  source={require("../assets/images/logo-vitran-primary.png")}
                  style={styles.logo}
                  resizeMode="contain"
              />

              <Text style={styles.title}>
                Welcome to Vitaran App
              </Text>
            </View>

            <View style={styles.formContainer}>
              <Text style={styles.label}>
                Registered Mobile Number
              </Text>

              <View style={styles.inputContainer}>
                <Ionicons
                    name="call-outline"
                    size={20}
                    color="#000"
                    style={styles.icon}
                />

                <Text style={styles.prefix}>
                  +91 -
                </Text>

                <TextInput
                    style={styles.input}
                    value={phoneNumber}
                    keyboardType="numeric"
                    maxLength={10}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isLoading}
                    blurOnSubmit={false}
                    onChangeText={(text) => {
                      const cleanText = text
                          .replace(/[^0-9]/g, "")
                          .slice(0, 10);

                      setPhoneNumber(cleanText);
                    }}
                />
              </View>

              <Text style={styles.label}>
                Password/OTP
              </Text>

              <View style={styles.inputContainer}>
                <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color="#000"
                    style={styles.icon}
                />

                <TextInput
                    style={styles.input}
                    placeholder="Enter password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    editable={!isLoading}
                    autoCapitalize="none"
                    autoCorrect={false}
                    blurOnSubmit={false}
                />

                <TouchableOpacity
                    onPress={() =>
                        setShowPassword((prev) => !prev)
                    }
                    disabled={isLoading}
                    activeOpacity={0.7}
                >
                  <Ionicons
                      name={
                        showPassword
                            ? "eye-outline"
                            : "eye-off-outline"
                      }
                      size={20}
                      color="#000"
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                  style={[
                    styles.loginButton,
                    isLoginDisabled &&
                    styles.loginButtonDisabled,
                  ]}
                  onPress={handleLogin}
                  disabled={isLoginDisabled}
                  activeOpacity={0.85}
              >
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator
                          size="small"
                          color="#FFFFFF"
                      />

                      <Text style={styles.loadingText}>
                        Verifying...
                      </Text>
                    </View>
                ) : (
                    <Text style={styles.loginButtonText}>
                      LOGIN
                    </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        <Toast />
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  keyboardContainer: {
    flex: 1,
  },

  innerContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  logoSection: {
    alignItems: "center",
    marginBottom: 30,
  },

  logo: {
    width: 280,
    height: 240,
  },

  title: {
    fontSize: 20,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 20,
    fontWeight: "600",
    fontFamily: "LeagueSpartan_600SemiBold",
  },

  formContainer: {
    width: "100%",
  },

  label: {
    fontSize: 13,
    color: "#9CA3AF",
    marginBottom: 8,
    marginLeft: 4,
    fontWeight: "500",
    fontFamily: "LeagueSpartan_400Regular",
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 16,
    marginBottom: 22,
    backgroundColor: "#FFFFFF",
  },

  icon: {
    marginRight: 12,
  },

  prefix: {
    fontSize: 16,
    color: "#111827",
    marginRight: 4,
    letterSpacing: 1,
  },

  input: {
    flex: 1,
    height: "100%",
    fontSize: 16,
    color: "#111827",
    letterSpacing: 1,
  },

  loginButton: {
    height: 52,
    marginTop: 10,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#590194",
  },

  loginButtonDisabled: {
    opacity: 0.6,
  },

  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
    fontFamily: "LeagueSpartan_700Bold",
  },

  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
  },

  loadingText: {
    marginLeft: 8,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
    fontFamily: "LeagueSpartan_700Bold",
  },
});