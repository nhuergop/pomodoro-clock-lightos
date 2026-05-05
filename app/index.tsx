import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
// --- NUEVO: Importación para el almacenamiento persistente ---
import AsyncStorage from '@react-native-async-storage/async-storage';

type TimerMode = 'WORK' | 'SHORT_BREAK' | 'LONG_BREAK';
type SoundType = 'BEEP' | 'BELL' | 'CHIME';

// Clave única para guardar los datos en el dispositivo
const STORAGE_KEY = '@pomodoro_user_settings_v1';

// Interfaz para tipar el objeto de configuración que persistiremos
interface UserSettings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
  totalSessions: number;
  selectedSound: SoundType;
}

export default function PomodoroScreen() {
  const systemColorScheme = useColorScheme();
  
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (systemColorScheme) {
      setTheme(systemColorScheme);
    }
  }, [systemColorScheme]);

  const isDarkMode = theme === 'dark';

  // const colors = {
  //   background: isDarkMode ? '#000000' : '#FFFFFF',
  //   textPrimary: isDarkMode ? '#FFFFFF' : '#000000',
  //   textSecondary: isDarkMode ? '#555555' : '#888888',
  //   border: isDarkMode ? '#333333' : '#E0E0E0',
  //   borderActive: isDarkMode ? '#FFFFFF' : '#000000',
  //   buttonBg: isDarkMode ? '#FFFFFF' : '#000000',
  //   buttonText: isDarkMode ? '#000000' : '#FFFFFF',
  //   buttonSecBg: isDarkMode ? '#000000' : '#FFFFFF',
  //   buttonSecText: isDarkMode ? '#FFFFFF' : '#000000',
  // };

  const colors = {
    background: isDarkMode ? '#000000' : '#FFFFFF',
    textPrimary: isDarkMode ? '#FFFFFF' : '#000000',
    textSecondary: isDarkMode ? '#cfcfcf' : '#888888',
    border: isDarkMode ? '#FFFFFF' : '#000000',
    borderActive: isDarkMode ? '#FFFFFF' : '#000000',
    buttonBg: isDarkMode ? '#FFFFFF' : '#000000',
    buttonText: isDarkMode ? '#000000' : '#FFFFFF',
    buttonSecBg: isDarkMode ? '#000000' : '#FFFFFF',
    buttonSecText: isDarkMode ? '#FFFFFF' : '#000000',
  };

  // --- Estados de configuración con sus valores por defecto iniciales ---
  const [workMinutes, setWorkMinutes] = useState<number>(25);
  const [shortBreakMinutes, setShortBreakMinutes] = useState<number>(5);
  const [longBreakMinutes, setLongBreakMinutes] = useState<number>(15);
  const [longBreakInterval, setLongBreakInterval] = useState<number>(4);
  const [totalSessions, setTotalSessions] = useState<number>(8);
  const [selectedSound, setSelectedSound] = useState<SoundType>('BELL');

  // Estados de control del temporizador
  const [mode, setMode] = useState<TimerMode>('WORK');
  const [secondsLeft, setSecondsLeft] = useState<number>(25 * 60);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [currentSession, setCurrentSession] = useState<number>(1);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState<boolean>(false); // Evita sobreescrituras al iniciar

  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- NUEVO: Cargar configuraciones guardadas al iniciar la App ---
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
        if (jsonValue != null) {
          const savedSettings: UserSettings = JSON.parse(jsonValue);

          setWorkMinutes(savedSettings.workMinutes);
          setShortBreakMinutes(savedSettings.shortBreakMinutes);
          setLongBreakMinutes(savedSettings.longBreakMinutes);
          setLongBreakInterval(savedSettings.longBreakInterval);
          setTotalSessions(savedSettings.totalSessions);
          setSelectedSound(savedSettings.selectedSound);

          // Inicializamos el reloj con el tiempo de focus guardado
          setSecondsLeft(savedSettings.workMinutes * 60);
        }
      } catch (e) {
        console.error("Error al cargar las configuraciones:", e);
      } finally {
        setIsSettingsLoaded(true);
      }
    };

    loadSettings();
  }, []);

  // --- NUEVO: Guardar configuraciones automáticamente cada vez que una de ellas cambie ---
  useEffect(() => {
    // Solo guardamos si ya se cargaron los datos iniciales para evitar machacar los datos del usuario con los valores por defecto
    if (!isSettingsLoaded) return;

    const saveSettings = async () => {
      try {
        const settingsToSave: UserSettings = {
          workMinutes,
          shortBreakMinutes,
          longBreakMinutes,
          longBreakInterval,
          totalSessions,
          selectedSound,
        };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settingsToSave));
      } catch (e) {
        console.error("Error al guardar las configuraciones:", e);
      }
    };

    saveSettings();
  }, [workMinutes, shortBreakMinutes, longBreakMinutes, longBreakInterval, totalSessions, selectedSound, isSettingsLoaded]);


  const playNotificationSound = (type: SoundType) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (audioContextRef.current) {
        try {
          audioContextRef.current.close(); // Cierra el contexto de audio anterior y libera sus recursos
        } catch (err) {
          console.warn("Error when trying to close previous context:", err);
        }
        audioContextRef.current = null;
      }

      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;
      const now = ctx.currentTime;

      const playTone = (
        freq: number, 
        startTime: number, 
        duration: number, 
        volume: number, 
        typeWave: 'sine' | 'triangle' = 'sine'
      ) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = typeWave;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(volume, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      // 4. EJECUCIÓN DE LOS TRES CASOS UTILIZANDO PLAYTONE
      if (type === 'BEEP') {
        // --- BEEP CLÁSICO REPETIDO (Duración: ~7.0 segundos) ---
        // Beep digital corto (800Hz) repetido rítmicamente cada 1.2 segundos (7 veces)
        for (let i = 0; i < 7; i++) {
          const time = now + (i * 1.2);
          playTone(800, time, 0.3, 0.15, 'sine');
        }
      } 
      else if (type === 'BELL') {
        // --- CAMPANA ZEN REPETIDA (Duración: ~9.5 segundos) ---
        // Cuenco tibetano original (440Hz, decaimiento largo) repetido 5 veces cada 2.5 segundos
        for (let i = 0; i < 5; i++) {
          const time = now + (i * 2.5);
          playTone(440, time, 1.5, 0.25, 'triangle');
        }
      } 
      else if (type === 'CHIME') {
        // --- CAMPANILLA DOBLE REPETIDA (Duración: ~7.5 segundos) ---
        // Tintineo doble brillante (880Hz y 1046Hz) repetido 6 veces cada 1.5 segundos
        const playDoubleTone = (startTime: number) => {
          playTone(880, startTime, 0.4, 0.12, 'sine');
          playTone(1046.5, startTime + 0.15, 0.5, 0.12, 'sine');
        };

        for (let i = 0; i < 6; i++) {
          playDoubleTone(now + (i * 1.5));
        }
      }
    } catch (e) {
      console.warn("Audio synthesizing not available or requires user interaction:", e);
    }
  };

  const getSecondsForMode = (targetMode: TimerMode): number => {
    switch (targetMode) {
      case 'WORK':
        return workMinutes * 60;
      case 'SHORT_BREAK':
        return shortBreakMinutes * 60;
      case 'LONG_BREAK':
        return longBreakMinutes * 60;
    }
  };

  // Efecto para actualizar los segundos en pantalla si el usuario cambia los tiempos (mientras no esté activo)
  useEffect(() => {
    if (!isActive && isSettingsLoaded) {
      setSecondsLeft(getSecondsForMode(mode));
    }
  }, [workMinutes, shortBreakMinutes, longBreakMinutes, mode, isSettingsLoaded]);

  useEffect(() => {
    if (isActive) {
      timerRef.current = window.setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, mode, currentSession, totalSessions, workMinutes, shortBreakMinutes, longBreakMinutes, longBreakInterval, selectedSound]);

  const handleTimerComplete = () => {
    playNotificationSound(selectedSound);

    if (mode === 'WORK') {
      if (currentSession < totalSessions) {
        const isTimeForLongBreak = currentSession % longBreakInterval === 0;

        if (isTimeForLongBreak) {
          setMode('LONG_BREAK');
          setSecondsLeft(longBreakMinutes * 60);
        } else {
          setMode('SHORT_BREAK');
          setSecondsLeft(shortBreakMinutes * 60);
        }
      } else {
        setIsActive(false);
        if (timerRef.current) clearInterval(timerRef.current);
        alert('¡Felicidades! Has completado todas tus sesiones del ciclo.');
        resetFullCycle();
      }
    } else {
      setCurrentSession((prev) => prev + 1);
      setMode('WORK');
      setSecondsLeft(workMinutes * 60);
    }
  };

  const toggleTimer = () => {
    setIsActive(!isActive);
  };

  const resetTimer = () => {
    setIsActive(false);
    setSecondsLeft(getSecondsForMode(mode));
  };

  const resetFullCycle = () => {
    setIsActive(false);
    setMode('WORK');
    setSecondsLeft(workMinutes * 60);
    setCurrentSession(1);
  };

  const switchMode = (newMode: TimerMode) => {
    setIsActive(false);
    setMode(newMode);
    setSecondsLeft(getSecondsForMode(newMode));
  };

  const incrementSessions = () => {
    if (!isActive) setTotalSessions((prev) => Math.min(prev + 24, 24));
  };

  const decrementSessions = () => {
    if (!isActive) {
      setTotalSessions((prev) => {
        const nextValue = Math.max(prev - 1, 1);
        if (currentSession > nextValue) setCurrentSession(nextValue);
        return nextValue;
      });
    }
  };

  const adjustTimerTime = (type: 'WORK' | 'SHORT' | 'LONG', operation: 'INC' | 'DEC') => {
    if (isActive) return;

    if (type === 'WORK') {
      setWorkMinutes((prev) => {
        const next = operation === 'INC' ? prev + 1 : prev - 1;
        return Math.max(1, Math.min(next, 120));
      });
    } else if (type === 'SHORT') {
      setShortBreakMinutes((prev) => {
        const next = operation === 'INC' ? prev + 1 : prev - 1;
        return Math.max(1, Math.min(next, 30));
      });
    } else {
      setLongBreakMinutes((prev) => {
        const next = operation === 'INC' ? prev + 1 : prev - 1;
        return Math.max(1, Math.min(next, 60));
      });
    }
  };

  const adjustLongBreakInterval = (operation: 'INC' | 'DEC') => {
    if (isActive) return;
    setLongBreakInterval((prev) => {
      const next = operation === 'INC' ? prev + 1 : prev - 1;
      return Math.max(1, Math.min(next, 12));
    });
  };

  const handleSelectSound = (type: SoundType) => {
    setSelectedSound(type);
    playNotificationSound(type);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const dynamicStyles = {
    container: [styles.container, { backgroundColor: colors.background }],
    modeText: (isActiveTab: boolean) => [
      styles.modeText,
      { color: isActiveTab ? colors.textPrimary : colors.textSecondary },
      isActiveTab && styles.modeTextActive
    ],
    separator: [styles.separator, { color: colors.border }],
    settingLabel: [styles.settingLabel, { color: colors.textSecondary }],
    settingLabelEnd: [styles.settingLabelEnd, { color: colors.textSecondary }],
    sessionSetter: [styles.sessionSetter, { borderColor: colors.border }],
    sessionNumber: [styles.sessionNumber, { color: colors.textPrimary }],
    sessionNumberFixed: [styles.sessionNumberFixed, { color: colors.textPrimary }],
    adjustButtonText: [styles.adjustButtonText, { color: colors.textPrimary }],
    timerText: [styles.timerText, { color: colors.textPrimary }],
    button: [styles.button, { backgroundColor: colors.buttonBg, borderColor: colors.textPrimary }],
    buttonText: [styles.buttonText, { color: colors.buttonText }],
    buttonSecondary: [styles.button, { backgroundColor: colors.buttonSecBg, borderColor: colors.textPrimary }],
    buttonTextSecondary: [styles.buttonTextSecondary, { color: colors.buttonSecText }],
    resetAllText: [styles.resetAllText, { color: colors.textSecondary }],
    soundOptionText: (isSelected: boolean) => [
      styles.soundOptionText,
      { color: isSelected ? colors.textPrimary : colors.textSecondary },
      isSelected && styles.soundOptionTextActive
    ]
  };

  return (
    <View style={dynamicStyles.container}>
      {/* Selector de Modo */}
      <View style={styles.modeSelector}>
        <Pressable onPress={() => switchMode('WORK')}>
          <Text style={dynamicStyles.modeText(mode === 'WORK')}>
            focus
          </Text>
        </Pressable>
        <Text style={dynamicStyles.separator}>|</Text>
        <Pressable onPress={() => switchMode('SHORT_BREAK')}>
          <Text style={dynamicStyles.modeText(mode === 'SHORT_BREAK')}>
            short break
          </Text>
        </Pressable>
        <Text style={dynamicStyles.separator}>|</Text>
        <Pressable onPress={() => switchMode('LONG_BREAK')}>
          <Text style={dynamicStyles.modeText(mode === 'LONG_BREAK')}>
            long break
          </Text>
        </Pressable>
      </View>

      {/* Panel de Configuración Superior */}
      <View style={styles.settingsPanel}>
        <View style={styles.settingItem}>
          <Text style={dynamicStyles.settingLabel}>
            {`session ${currentSession} of `
            /* {mode === 'WORK' ? `session ${currentSession} of ` : 'session: '} */}
          </Text>
          {!isActive && mode === 'WORK' ? (
            <View style={dynamicStyles.sessionSetter}>
              <Pressable onPress={decrementSessions} style={styles.adjustButton}><Text style={dynamicStyles.adjustButtonText}>-</Text></Pressable>
              <Text style={dynamicStyles.sessionNumber}>{totalSessions}</Text>
              <Pressable onPress={incrementSessions} style={styles.adjustButton}><Text style={dynamicStyles.adjustButtonText}>+</Text></Pressable>
            </View>
          ) : (
            <Text style={dynamicStyles.sessionNumberFixed}>{totalSessions}</Text>
          )}
        </View>

        {!isActive && (
          <View style={styles.breaksConfigContainer}>
            <View style={styles.settingItem}>
              <Text style={dynamicStyles.settingLabel}>focus time: </Text>
              <View style={dynamicStyles.sessionSetter}>
                <Pressable onPress={() => adjustTimerTime('WORK', 'DEC')} style={styles.adjustButton}><Text style={dynamicStyles.adjustButtonText}>-</Text></Pressable>
                <Text style={dynamicStyles.sessionNumber}>{workMinutes}m</Text>
                <Pressable onPress={() => adjustTimerTime('WORK', 'INC')} style={styles.adjustButton}><Text style={dynamicStyles.adjustButtonText}>+</Text></Pressable>
              </View>
            </View>

            <View style={styles.settingItem}>
              <Text style={dynamicStyles.settingLabel}>short break: </Text>
              <View style={dynamicStyles.sessionSetter}>
                <Pressable onPress={() => adjustTimerTime('SHORT', 'DEC')} style={styles.adjustButton}><Text style={dynamicStyles.adjustButtonText}>-</Text></Pressable>
                <Text style={dynamicStyles.sessionNumber}>{shortBreakMinutes}m</Text>
                <Pressable onPress={() => adjustTimerTime('SHORT', 'INC')} style={styles.adjustButton}><Text style={dynamicStyles.adjustButtonText}>+</Text></Pressable>
              </View>
            </View>

            <View style={styles.settingItem}>
              <Text style={dynamicStyles.settingLabel}>long break: </Text>
              <View style={dynamicStyles.sessionSetter}>
                <Pressable onPress={() => adjustTimerTime('LONG', 'DEC')} style={styles.adjustButton}><Text style={dynamicStyles.adjustButtonText}>-</Text></Pressable>
                <Text style={dynamicStyles.sessionNumber}>{longBreakMinutes}m</Text>
                <Pressable onPress={() => adjustTimerTime('LONG', 'INC')} style={styles.adjustButton}><Text style={dynamicStyles.adjustButtonText}>+</Text></Pressable>
              </View>
            </View>

            <View style={styles.settingItem}>
              <Text style={dynamicStyles.settingLabel}>long break every: </Text>
              <View style={dynamicStyles.sessionSetter}>
                <Pressable onPress={() => adjustLongBreakInterval('DEC')} style={styles.adjustButton}><Text style={dynamicStyles.adjustButtonText}>-</Text></Pressable>
                <Text style={dynamicStyles.sessionNumber}>{longBreakInterval}</Text>
                <Pressable onPress={() => adjustLongBreakInterval('INC')} style={styles.adjustButton}><Text style={dynamicStyles.adjustButtonText}>+</Text></Pressable>
              </View>
              <Text style={dynamicStyles.settingLabelEnd}> sessions</Text>
            </View>

            <View style={styles.soundSelectorContainer}>
              <Text style={dynamicStyles.settingLabel}>alert sound: </Text>
              <View style={styles.soundOptions}>
                <Pressable onPress={() => handleSelectSound('BEEP')}>
                  <Text style={dynamicStyles.soundOptionText(selectedSound === 'BEEP')}>beep</Text>
                </Pressable>
                <Text style={dynamicStyles.separator}>·</Text>
                <Pressable onPress={() => handleSelectSound('BELL')}>
                  <Text style={dynamicStyles.soundOptionText(selectedSound === 'BELL')}>bell</Text>
                </Pressable>
                <Text style={dynamicStyles.separator}>·</Text>
                <Pressable onPress={() => handleSelectSound('CHIME')}>
                  <Text style={dynamicStyles.soundOptionText(selectedSound === 'CHIME')}>chime</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Temporizador */}
      <View style={styles.timerContainer}>
        <Text style={dynamicStyles.timerText}>{formatTime(secondsLeft)}</Text>
      </View>

      {/* Controles de Acción */}
      <View style={styles.controlsContainer}>
        <Pressable style={dynamicStyles.button} onPress={toggleTimer}>
          <Text style={dynamicStyles.buttonText}>
            {isActive ? 'pause' : 'start'}
          </Text>
        </Pressable>

        <Pressable style={dynamicStyles.buttonSecondary} onPress={resetTimer}>
          <Text style={dynamicStyles.buttonTextSecondary}>reset timer</Text>
        </Pressable>

        {(currentSession > 1 || mode !== 'WORK') && (
          <Pressable onPress={resetFullCycle}>
            <Text style={dynamicStyles.resetAllText}>reset progress</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  modeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
  },
  modeText: {
    fontSize: 15,
    fontFamily: 'System',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textTransform: 'lowercase',
  },
  modeTextActive: {
    fontWeight: 'bold',
  },
  separator: {
    fontSize: 14,
    fontWeight: 'bold'
  },
  settingsPanel: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
  },
  breaksConfigContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
  },
  settingLabel: {
    fontSize: 14,
    fontFamily: 'System',
    textTransform: 'lowercase',
  },
  settingLabelEnd: {
    fontSize: 14,
    fontFamily: 'System',
    textTransform: 'lowercase',
    marginLeft: 4,
  },
  sessionSetter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  sessionNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    minWidth: 32,
    textAlign: 'center',
  },
  sessionNumberFixed: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  adjustButton: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  adjustButtonText: {
    fontSize: 16,
    fontWeight: '300',
  },
  soundSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    marginTop: 2,
  },
  soundOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 4,
  },
  soundOptionText: {
    fontSize: 14,
    fontFamily: 'System',
    textTransform: 'lowercase',
    paddingHorizontal: 4,
  },
  soundOptionTextActive: {
    fontWeight: 'bold',
    // textDecorationLine: 'underline',
  },
  timerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerText: {
    fontSize: 84,
    fontFamily: 'System',
    fontWeight: '200',
    letterSpacing: -2,
  },
  controlsContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  button: {
    width: '80%',
    maxWidth: 280,
    height: 52,
    borderWidth: 2,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'System',
    fontWeight: '600',
    textTransform: 'lowercase',
  },
  buttonTextSecondary: {
    fontSize: 16,
    fontFamily: 'System',
    textTransform: 'lowercase',
  },
  resetAllText: {
    marginTop: 8,
    fontSize: 14,
    textDecorationLine: 'underline',
    textTransform: 'lowercase',
  },
});