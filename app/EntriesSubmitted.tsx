import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export default function EntriesSubmitted() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const amount = params.amount || '0';

  const handleLogout = async () => {
    try {
      if (Platform.OS === 'web') {
        await AsyncStorage.removeItem('authToken');
        await AsyncStorage.removeItem('workerId');
      } else {
        await SecureStore.deleteItemAsync('authToken');
        await SecureStore.deleteItemAsync('workerId');
      }
      await AsyncStorage.multiRemove(['workerName', 'userType']);
      router.replace('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.content}>
        <Text style={styles.title}>Hey!</Text>
        <Text style={styles.subtitle}>You have already submitted{"\n"}today's entry.</Text>

        <View style={styles.cardWrapper}>
          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <Ionicons name="checkmark" size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.amountLabel}>Submitted Amount</Text>
            <Text style={styles.amountValue}>₹{amount}</Text>
          </View>
        </View>

        <Text style={styles.footerText}>See you again tomorrow.</Text>

        <TouchableOpacity 
          style={styles.button}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={24} color="#FFFFFF" style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: '#590194',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 18,
    color: '#4B5563',
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 26,
    marginBottom: 60,
  },
  cardWrapper: {
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 50,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: Platform.OS === 'android' ? 1 : 0,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F43F5E',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: -32,
    borderWidth: 4,
    borderColor: '#F8F9FA',
  },
  amountLabel: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
  },
  amountValue: {
    fontSize: 48,
    fontWeight: '800',
    color: '#22C55E',
    letterSpacing: -1,
  },
  footerText: {
    fontSize: 18,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 20,
  },
  button: {
    flexDirection: 'row',
    backgroundColor: '#590194',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: '#590194',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonIcon: {
    marginRight: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
