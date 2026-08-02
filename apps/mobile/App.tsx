import React from 'react';
import { StyleSheet, Text, View, SafeAreaView, StatusBar } from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>AI Concierge (X-One Assistant)</Text>
        <Text style={styles.subtitle}>Mobile Application</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.text}>Chatbot đặt xe & dịch vụ thông minh ngay trên di động.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 20,
    backgroundColor: '#1e293b',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  text: {
    fontSize: 16,
    color: '#334155',
    textAlign: 'center',
  },
});
