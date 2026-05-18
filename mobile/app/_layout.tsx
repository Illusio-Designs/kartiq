import '../global.css';
// Side-effect import — installs the Alert.alert → appAlert intercept
// and the Text/TextInput Agency-font render-patch BEFORE any component
// renders. Must stay at the top of the imports, above any RN imports
// that reference Text / TextInput so the override is in place when
// those components first mount.
import { installGlobalOverrides } from '../lib/global-overrides';
installGlobalOverrides();

import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Slot, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { hydrateTokenCache, tokenStorage } from '../lib/storage';
import { useAuthStore } from '../store/auth.store';
import ErrorBoundary from '../components/ErrorBoundary';
import AnimatedSplash from '../components/SplashScreen';
import IntroScreen from '../components/IntroScreen';
import Toaster from '../components/ui/Toaster';
import AppAlert from '../components/ui/AppAlert';
import { BiometricLock } from '../components/BiometricLock';
import { evaluateLockOnBoot, getLockNeeded } from '../lib/biometric';
import { bootstrapPush } from '../lib/push';
import { attachDeepLinkHandler } from '../lib/deep-links';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Cached for 24h so a no-network cold start still has the last known data
// to render. Mutations are NOT persisted — those need fresh server state.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: CACHE_TTL_MS,    // keep in memory long enough for the persister
      retry: 1,
      networkMode: 'offlineFirst', // serve cache when offline, retry on reconnect
    },
  },
});

const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'kartriq.query-cache',
  // Skip mutations + huge result sets to stay under AsyncStorage's per-key
  // ~6MB ceiling on Android.
  serialize: (data) => JSON.stringify(data),
  deserialize: (s) => JSON.parse(s),
  throttleTime: 1000,
});

// Note: Poppins (the body font) is applied globally to every Text /
// TextInput via the render-patch in lib/global-overrides.ts. The earlier
// Text.defaultProps mutation only worked on class components and was
// a no-op on RN 0.81's function-component Text.

export default function RootLayout() {
  // Loads the brand font from /assets before the splash hides. Until
  // it's ready (or fails) we keep the splash up so the user never sees
  // a system-font flash. The fallback path on `error` is to proceed
  // with defaultProps falling through to the platform font — better
  // than showing nothing.
  const [fontsLoaded, fontError] = useFonts({
    Poppins: require('../assets/fonts/Poppins-Regular.ttf'),
    Agency: require('../assets/fonts/agency.otf'),
  });

  const [ready, setReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showIntro, setShowIntro] = useState(false);
  const [introChecked, setIntroChecked] = useState(false);
  const [locked, setLocked] = useState(false);
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    (async () => {
      await hydrateTokenCache();
      // Decide on biometric lock BEFORE rendering the app shell. Reads
      // 'biometric.enabled' + token presence from secure storage. If both
      // hold, render BiometricLock until the user authenticates.
      await evaluateLockOnBoot();
      setLocked(getLockNeeded());
      const seen = await tokenStorage.get('intro-seen');
      if (!seen) setShowIntro(true);
      setIntroChecked(true);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    // Wait for the font to resolve (or definitively fail) before
    // dropping the splash so the first frame doesn't show a system-font
    // flicker that re-renders to Agency moments later.
    if (ready && hydrated && (fontsLoaded || fontError)) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready, hydrated, fontsLoaded, fontError]);

  // Push registration — fire only after the user is authenticated so the
  // OS permission prompt doesn't appear on a cold install before login.
  // The bootstrap is idempotent so re-renders don't trigger duplicate
  // permission requests.
  const userId = useAuthStore((s) => s.user?.id);
  useEffect(() => {
    if (userId) {
      bootstrapPush();
    }
  }, [userId]);

  // Deep-link router — listens to incoming kartriq:// and https://kartriq.com
  // URLs (cold-start + warm-start) and translates them to expo-router push
  // calls. Mounted once at root.
  useEffect(() => {
    const detach = attachDeepLinkHandler();
    return detach;
  }, []);

  const onSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  const onIntroFinish = useCallback(async () => {
    await tokenStorage.set('intro-seen', 'true');
    setShowIntro(false);
  }, []);

  if (!ready || !hydrated || (!fontsLoaded && !fontError)) return null;

  // Show custom animated splash
  if (showSplash) {
    return (
      <>
        <StatusBar style="light" />
        <AnimatedSplash onFinish={onSplashFinish} />
      </>
    );
  }

  // Show intro slides on first launch
  if (showIntro && introChecked) {
    return (
      <>
        <StatusBar style="light" />
        <IntroScreen onFinish={onIntroFinish} />
      </>
    );
  }

  // Biometric gate — runs before the app shell when the user has opted
  // in and there's a stored token. Once authenticated, the lock vanishes
  // for this session.
  if (locked) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <BiometricLock onUnlocked={() => setLocked(false)} />
      </SafeAreaProvider>
    );
  }

  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: queryPersister,
          maxAge: CACHE_TTL_MS,
          // Bump this string when the API response shape changes so we don't
          // try to render stale schemas after an app update.
          buster: 'v1',
          dehydrateOptions: {
            // Only persist successful query results; skip pending /
            // erroring queries so users don't see stale spinners.
            shouldDehydrateQuery: (q) => q.state.status === 'success',
          },
        }}
      >
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <Slot />
          <Toaster />
          <AppAlert />
        </SafeAreaProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}
