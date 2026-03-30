"use client"

import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { useRouter } from "expo-router"
import { useEffect, useState } from "react"
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
  ScrollView
} from "react-native"
import Toast from 'react-native-toast-message'
import apiClient from '../services/apiClient'

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

  useEffect(() => {
    checkLoggedInStatus();
  }, []);

  const checkLoggedInStatus = async () => {
    try {
      let token;
      if (Platform.OS === 'web') {
        token = await AsyncStorage.getItem('authToken');
      } else {
        token = await SecureStore.getItemAsync('authToken');
      }

      const workerId = await AsyncStorage.getItem('workerId');

      if (token && workerId) {
        router.replace({
          pathname: '/MorningStockScreen',
          params: { workerId: workerId }
        });
      }
    } catch (e) {
      console.error('Failed to check login status', e);
    }
  };

  const handleLogin = async () => {
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
      const data = await apiClient.post<WorkerLoginResponse>('/auth/worker-login', {
        phoneNumber: phoneNumber.trim(),
        password: password,
      }) as unknown as WorkerLoginResponse;

      if (data.success === true && data.token && data.worker) {
        if (Platform.OS === 'web') {
          await AsyncStorage.setItem('authToken', data.token); // Web fallback
        } else {
          await SecureStore.setItemAsync('authToken', data.token); // Store token securely on mobile
        }
        await AsyncStorage.setItem('userType', data.userType);
        await AsyncStorage.setItem('workerId', data.worker.workerId.toString());
        await AsyncStorage.setItem('workerName', `${data.worker.firstName} ${data.worker.lastName}`);

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

    } catch (error: any) {
      console.error(error);
      Toast.show({
        type: 'error',
        text1: 'Login Failed',
        text2: error.message || 'Unable to connect to server. Please check your internet connection.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/images/logo-vitran-primary.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          
          <Text style={styles.title}>Welcome to Vitaran App</Text>

          <View style={styles.formContainer}>
            <Text style={styles.label}>Registered Mobile Number</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="call-outline" size={20} color="#000" style={styles.icon} />
              <Text style={styles.prefix}>+91 - </Text>
              <TextInput
                style={styles.inputWithIcon}
                placeholder="9111111111"
                value={phoneNumber}
                onChangeText={(text) => {
                  const cleanText = text.replace(/[^0-9]/g, "").slice(0, 10)
                  setPhoneNumber(cleanText)
                }}
                keyboardType="numeric"
                maxLength={10}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
            </View>

            <Text style={styles.label}>Password/OTP</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#000" style={styles.icon} />
              <TextInput
                style={styles.inputWithIcon}
                placeholder="Enter password"
                value={password}
                onChangeText={setPassword}
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
                  color="#000"
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.loginButton,
              (phoneNumber.length !== 10 || !password.trim() || isLoading) && styles.loginButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={phoneNumber.length !== 10 || !password.trim() || isLoading}
          >
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={[styles.loginButtonText, { marginLeft: 8 }]}>Verifying...</Text>
              </View>
            ) : (
              <Text style={styles.loginButtonText}>LOGIN</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      <Toast />
    </SafeAreaView>
  )
}

// Barebones styles for Step 3a: UI Skeleton only
const styles = StyleSheet.create({
  safeArea: {},
  container: {},
  content: {},
  logoContainer: {},
  logo: {},
  title: {},
  formContainer: {},
  label: {},
  inputContainer: { flexDirection: "row", alignItems: "center" },
  icon: {},
  prefix: {},
  inputWithIcon: {},
  loginButton: {},
  loginButtonDisabled: {},
  loginButtonText: {},
  loadingContainer: { flexDirection: "row" },
})
