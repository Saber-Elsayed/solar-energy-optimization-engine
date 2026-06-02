import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

type PasswordInputProps = Omit<TextInputProps, 'secureTextEntry'> & {
  value: string;
  onChangeText: (text: string) => void;
};

export function PasswordInput({ value, onChangeText, style, ...rest }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.row}>
      <TextInput
        {...rest}
        style={[styles.input, style]}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        onPress={() => setVisible((current) => !current)}
        style={styles.eyeButton}>
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={22} color="#64748b" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingRight: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    color: '#0f172a',
  },
  eyeButton: {
    position: 'absolute',
    right: 10,
    height: '100%',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
