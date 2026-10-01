import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * Renders a simplified traffic-sign shape (octagon/triangle/circle/rectangle)
 * using plain View borders and rotation — no image assets required, which
 * keeps this feature dependency-free and easy to extend with new signs.
 */
export default function SignShape({ shape, color, size = 48 }) {
  if (shape === 'triangle') {
    return (
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: size / 2,
          borderRightWidth: size / 2,
          borderBottomWidth: size * 0.85,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
    );
  }

  if (shape === 'octagon') {
    // Approximated with a rotated square + overlay for a stop-sign feel —
    // simple and recognizable without needing real geometry.
    return (
      <View
        style={{
          width: size * 0.8,
          height: size * 0.8,
          backgroundColor: color,
          transform: [{ rotate: '22.5deg' }],
          borderRadius: 6,
        }}
      />
    );
  }

  if (shape === 'rectangle') {
    return (
      <View
        style={{
          width: size,
          height: size * 0.65,
          backgroundColor: color,
          borderRadius: 6,
        }}
      />
    );
  }

  // default: circle
  return (
    <View
      style={{
        width: size * 0.8,
        height: size * 0.8,
        borderRadius: (size * 0.8) / 2,
        borderWidth: size * 0.12,
        borderColor: color,
        backgroundColor: '#FFFFFF',
      }}
    />
  );
}
