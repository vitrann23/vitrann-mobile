"use client"

import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { LinearGradient } from "expo-linear-gradient"
import { useRouter } from "expo-router"
import { useState } from "react"

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
  View
} from "react-native"
import Toast from 'react-native-toast-message'

const API_BASE_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL ?? 'https://theinfranova.com/api';

interface WorkerLoginResponse {
  success: boolean
  message: string
  token: string
  userType: string
  worker: {
    workerId: number
    firstName: string
    lastName: string
    phoneNumber: string
    role: string
    isActive: boolean
  }
}

export default function Index() {
  const [phoneNumber, setPhoneNumber] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  const handleLogin = async () => {
    // Validation
    if (!phoneNumber.trim()) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Please enter your phone number' });
      return;
    }
    if (phoneNumber.length !== 10) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Phone number must be 10 digits' });
      return;
    }
    if (!password.trim()) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Please enter your password' });
      return;
    }

    setIsLoading(true);

    try {
      console.log("Connecting to backend:", API_BASE_URL);
      const response = await fetch(`${API_BASE_URL}/auth/worker-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },

        body: JSON.stringify({
          phoneNumber: phoneNumber.trim(),
          password: password,
        }),
      });

      const data: WorkerLoginResponse = await response.json();

      if (data.success === true && data.token && data.worker) {
        // Store authentication data
        await AsyncStorage.setItem('authToken', data.token);
        await AsyncStorage.setItem('userType', data.userType);
        await AsyncStorage.setItem('workerId', data.worker.workerId.toString());
        await AsyncStorage.setItem('workerName', `${data.worker.firstName} ${data.worker.lastName}`);

        // Check if cash has already been submitted for today
        try {
          const cashCheckResponse = await fetch(`${API_BASE_URL}/deliveries/total-amount`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${data.token}`,
            },
          });
          
          const cashData = await cashCheckResponse.json();
          
          // If cash record exists for today, redirect to day completed screen
          if (cashData.success && cashData.data && cashData.data.amount !== undefined) {
            Toast.show({
              type: 'info',
              text1: 'Day Already Completed',
              text2: 'You have already submitted cash for today.',
            });

            setTimeout(() => {
              router.replace('/DayCompletedScreen');
            }, 1200);
            return;
          }
        } catch (cashCheckError) {
          // If check fails, continue with normal login flow
          console.log('Cash check failed, proceeding with login:', cashCheckError);
        }

        Toast.show({
          type: 'success',
          text1: 'Login Successful',
          text2: `Welcome, ${data.worker.firstName}!`,
        });

        setTimeout(() => {
          router.replace({
            pathname: '/MorningStockScreen',
            params: { workerId: data.worker.workerId }
          });
        }, 1200);

      } else {
        Toast.show({
          type: 'error',
          text1: 'Login Failed',
          text2: data.message || 'Invalid phone number or password',
        });
      }

    } catch (error) {
      console.error(error);
      Toast.show({
        type: 'error',
        text1: 'Connection Error',
        text2: 'Unable to connect to server. Please check your internet connection.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
      <LinearGradient
        colors={["#F8F9FA", "#E9ECEF"]}
        style={styles.gradientBackground}
      >
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.content}>
            <View style={styles.card}>

              <View style={styles.logoContainer}>
                <Image
                  source={require('../assets/images/icon.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>

              <Text style={styles.subtitle}>Worker Login Portal</Text>

              {/* Phone Number Input */}
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="call-outline"
                  size={20}
                  color="#64748B"
                  style={styles.icon}
                />
                <TextInput
                  placeholder="Enter your number"
                  value={phoneNumber}
                  onChangeText={(text) => {
                    const cleanText = text.replace(/[^0-9]/g, "").slice(0, 10)
                    setPhoneNumber(cleanText)
                  }}
                  style={styles.inputWithIcon}
                  keyboardType="numeric"
                  maxLength={10}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                />
              </View>

              {/* Password Input (Original Styling) */}
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color="#64748B"
                  style={styles.icon}
                />
                <TextInput
                  placeholder="Enter your password"
                  value={password}
                  onChangeText={setPassword}
                  style={styles.inputWithIcon}
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                >
                  <Ionicons
                    name={showPassword ? "eye-outline" : "eye-off-outline"}
                    size={20}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>

              {/* Login Button (Original Styling) */}
              <TouchableOpacity
                style={[
                  styles.button,
                  (phoneNumber.length !== 10 || !password.trim() || isLoading) && styles.buttonDisabled,
                ]}
                onPress={handleLogin}
                disabled={phoneNumber.length !== 10 || !password.trim() || isLoading}
              >
                {isLoading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={[styles.buttonText, { marginLeft: 8 }]}>Logging in...</Text>
                  </View>
                ) : (
                  <Text style={styles.buttonText}>LOGIN</Text>
                )}
              </TouchableOpacity>

            </View>
          </View>
        </KeyboardAvoidingView>
      </LinearGradient>
      <Toast />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  gradientBackground: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    width: 120,
    height: 120,
  },
  subtitle: {
    fontSize: 16,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 32,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  icon: {
    marginRight: 8,
  },
  inputWithIcon: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: "#1E293B",
  },
  button: {
    height: 50,
    borderRadius: 8,
    backgroundColor: "#3B82F6",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  buttonDisabled: {
    backgroundColor: "#93C5FD",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
})
