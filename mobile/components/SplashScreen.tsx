import { useEffect, useRef } from 'react';
import { Animated, Image, Text, View } from 'react-native';

type Props = {
  onFinish: () => void;
};

export default function AnimatedSplash({ onFinish }: Props) {
  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(20)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const dotScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // Logo appears with spring
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // App name slides up
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.spring(textTranslateY, {
          toValue: 0,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
      ]),
      // Tagline and dot
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(dotScale, {
          toValue: 1,
          friction: 5,
          tension: 100,
          useNativeDriver: true,
        }),
      ]),
      // Hold
      Animated.delay(600),
    ]).start(() => onFinish());
  }, []);

  return (
    <View className="flex-1 bg-slate-900 items-center justify-center">
      {/* Subtle glow behind logo */}
      <View
        className="absolute w-40 h-40 rounded-full"
        style={{
          backgroundColor: '#06D4B8',
          opacity: 0.08,
          transform: [{ scale: 2 }],
        }}
      />

      {/* Logo */}
      <Animated.View
        style={{
          opacity: logoOpacity,
          transform: [{ scale: logoScale }],
        }}
      >
        <View
          className="w-20 h-20 rounded-3xl bg-emerald-500 items-center justify-center mb-8"
          style={{
            shadowColor: '#06D4B8',
            shadowOpacity: 0.5,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 8 },
            elevation: 10,
          }}
        >
          <Image
            source={require('../assets/logo-mark-white.png')}
            style={{ width: 48, height: 48 }}
            resizeMode="contain"
          />
        </View>
      </Animated.View>

      {/* App name */}
      <Animated.View
        style={{
          opacity: textOpacity,
          transform: [{ translateY: textTranslateY }],
        }}
      >
        <Text className="text-white text-3xl font-extrabold tracking-tight">
          Kartriq
        </Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.View
        className="flex-row items-center mt-3"
        style={{ opacity: taglineOpacity }}
      >
        <Animated.View
          className="w-2 h-2 rounded-full bg-emerald-500 mr-2"
          style={{ transform: [{ scale: dotScale }] }}
        />
        <Text className="text-slate-500 text-sm font-medium tracking-wide">
          Multi-channel Commerce
        </Text>
      </Animated.View>

      {/* Bottom version */}
      <Animated.View
        className="absolute bottom-12"
        style={{ opacity: taglineOpacity }}
      >
        <Text className="text-slate-700 text-xs font-medium">v0.1.0</Text>
      </Animated.View>
    </View>
  );
}
