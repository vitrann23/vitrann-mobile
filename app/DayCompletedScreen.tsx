"use client"

import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'

export default function DayCompletedScreen() {
  const router = useRouter()
  const [workerName, setWorkerName] = useState<string>('')
  const [completedDate, setCompletedDate] = useState<string>('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const name = await AsyncStorage.getItem('workerName')
      if (name) setWorkerName(name)
      
      // Show today's date
      const today = new Date()
      const formattedDate = today.toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
      setCompletedDate(formattedDate)
    } catch (error) {
      console.error('Error loading data:', error)
    }
  }

  const handleLogout = async () => {
    try {
      // Clear auth data
      await AsyncStorage.removeItem('authToken')
      await AsyncStorage.removeItem('userType')
      await AsyncStorage.removeItem('workerId')
      await AsyncStorage.removeItem('workerName')

      Toast.show({
        type: 'success',
        text1: 'Logged Out',
        text2: 'See you tomorrow!',
        visibilityTime: 2000,
      })

      setTimeout(() => {
        router.replace('/')
      }, 1000)
    } catch (error) {
      console.error('Error logging out:', error)
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to logout',
      })
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={100} color="#22C55E" />
        </View>

        {/* Title */}
        <Text style={styles.title}>Day Completed! 🎉</Text>

        {/* Worker Name */}
        {workerName && (
          <Text style={styles.workerName}>Great work, {workerName}!</Text>
        )}

        {/* Message */}
        <View style={styles.messageBox}>
          <Text style={styles.messageTitle}>Your daily tasks are complete</Text>
          <Text style={styles.messageText}>
            You have already submitted your cash for today. No further actions are required.
          </Text>
          {completedDate && (
            <Text style={styles.dateText}>
              Date: {completedDate}
            </Text>
          )}
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={24} color="#3B82F6" />
          <Text style={styles.infoText}>
            You can log in again tomorrow to start a new day's work.
          </Text>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 8,
  },
  workerName: {
    fontSize: 18,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
  },
  messageBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 16,
  },
  messageTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#22C55E',
    textAlign: 'center',
    marginBottom: 8,
  },
  messageText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
  dateText: {
    fontSize: 14,
    color: '#3B82F6',
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '500',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 16,
    width: '100%',
    marginBottom: 32,
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#3B82F6',
    lineHeight: 20,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
})
