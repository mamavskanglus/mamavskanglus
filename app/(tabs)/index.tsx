// app/index.tsx - COMPREHENSIVE FIXES
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Dimensions, Animated, Image, Platform } from 'react-native';
import { Audio } from 'expo-av';

const { width, height } = Dimensions.get('window');

const BIRD_SIZE = 60;
const PIPE_WIDTH = 60;
const INITIAL_PIPE_GAP = 300;
const INITIAL_GRAVITY = 0.35;
const INITIAL_FLAP_STRENGTH = -6;
const INITIAL_PIPE_SPEED = 1.2;
const MAX_LIVES = 3;
const CLOUD_WIDTH = 100;
const CLOUD_HEIGHT = 60;
const GRASS_HEIGHT = 30;
const BULLET_SPEED = 10;
const BULLET_SIZE = 15;
const VILLAIN_SIZE = 120;
const VILLAIN_SPEED = 2.2;

interface Pipe { id: number; x: number; topHeight: number; scored: boolean; }
interface Cloud { id: number; x: number; y: number; speed: number; size: number; }
interface Bullet { id: number; x: number; y: number; }
interface Villain { 
  id: number; 
  x: number; 
  y: number; 
  speedX: number; 
  speedY: number;
  scaleAnim: Animated.Value;
}
interface DeathEffect { id: number; x: number; y: number; progress: Animated.Value; }

export default function GameScreen() {
  const [gameState, setGameState] = useState<'menu' | 'countdown' | 'playing' | 'gameover'>('menu');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [birdY, setBirdY] = useState(height / 2);
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [clouds, setClouds] = useState<Cloud[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [villains, setVillains] = useState<Villain[]>([]);
  const [deathEffects, setDeathEffects] = useState<DeathEffect[]>([]);
  const [countdown, setCountdown] = useState(3);
  const [pipeSpeed, setPipeSpeed] = useState(INITIAL_PIPE_SPEED);
  const [pipeGap, setPipeGap] = useState(INITIAL_PIPE_GAP);
  const [pipeFrequency, setPipeFrequency] = useState(200);
  const [lives, setLives] = useState(MAX_LIVES);
  const [invincible, setInvincible] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [deathSound, setDeathSound] = useState<Audio.Sound | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Dynamic character physics based on score
  const [currentGravity, setCurrentGravity] = useState(INITIAL_GRAVITY);
  const [currentFlapStrength, setCurrentFlapStrength] = useState(INITIAL_FLAP_STRENGTH);

  const birdVelocity = useRef(0);
  const frameCount = useRef(0);
  const passedPipes = useRef(new Set<number>());
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const invincibleAnim = useRef(new Animated.Value(1)).current;
  const lastHitTime = useRef(0);
  const lastVillainSpawn = useRef(0);
  const lastBulletSpawn = useRef(0);
  const lastPipeSpawn = useRef(0);

  // Frame rate control
  const lastFrameTime = useRef(0);
  const targetFPS = 60;
  const frameInterval = 1000 / targetFPS;

  // FIX 1: Web Audio Support
  const [webAudio, setWebAudio] = useState<HTMLAudioElement | null>(null);
  const [webDeathAudio, setWebDeathAudio] = useState<HTMLAudioElement | null>(null);

  // Audio initialization
  useEffect(() => {
    const loadSounds = async () => {
      try {
        if (Platform.OS === 'web') {
          // Web audio solution
          const bgAudio = new Audio();
          bgAudio.src = '/assets/sounds/background-music.mp3';
          bgAudio.loop = true;
          bgAudio.volume = 0.3;
          setWebAudio(bgAudio);

          const deathAudio = new Audio();
          deathAudio.src = '/assets/sounds/death-sound.mp3';
          deathAudio.volume = 0.7;
          setWebDeathAudio(deathAudio);
        } else {
          // Mobile audio solution
          const { sound: bg } = await Audio.Sound.createAsync(
            require('../../assets/sounds/background-music.mp3'),
            { shouldPlay: true, isLooping: true, volume: 0.3 }
          );
          setSound(bg);

          const { sound: deathSfx } = await Audio.Sound.createAsync(
            require('../../assets/sounds/death-sound.mp3'),
            { shouldPlay: false, volume: 0.7 }
          );
          setDeathSound(deathSfx);
        }
      } catch (e) {
        console.log('Error loading sounds', e);
      }
    };
    loadSounds();

    return () => {
      if (sound) sound.unloadAsync();
      if (deathSound) deathSound.unloadAsync();
    };
  }, []);

  // Audio control
  useEffect(() => {
    const control = async () => {
      if (Platform.OS === 'web') {
        if (webAudio) {
          if ((gameState === 'playing' || gameState === 'countdown') && !isMuted) {
            await webAudio.play();
            webAudio.volume = 0.3;
          } else {
            webAudio.pause();
          }
        }
      } else {
        if (!sound) return;
        if ((gameState === 'playing' || gameState === 'countdown') && !isMuted) {
          await sound.playAsync();
          await sound.setVolumeAsync(0.3);
        } else {
          await sound.pauseAsync();
        }
      }
    };
    control();
  }, [gameState, sound, webAudio, isMuted]);

  const toggleMute = async () => {
    setIsMuted(prev => !prev);
    if (Platform.OS === 'web') {
      if (webAudio) {
        webAudio.volume = isMuted ? 0.3 : 0;
      }
    } else {
      if (sound) {
        if (isMuted) {
          if (gameState === 'playing' || gameState === 'countdown') await sound.playAsync();
          await sound.setVolumeAsync(0.3);
        } else {
          await sound.setVolumeAsync(0);
        }
      }
    }
  };

  const playDeathSound = async () => {
    if (isMuted) return;
    
    if (Platform.OS === 'web') {
      if (webDeathAudio) {
        webDeathAudio.currentTime = 0;
        await webDeathAudio.play();
      }
    } else {
      if (deathSound) {
        try {
          await deathSound.stopAsync();
          await deathSound.setPositionAsync(0);
          await deathSound.playAsync();
        } catch (e) { console.log(e); }
      }
    }
  };

  // Add death effect animation
  const addDeathEffect = (x: number, y: number) => {
    const progress = new Animated.Value(0);
    const effect: DeathEffect = { id: Date.now(), x, y, progress };
    
    setDeathEffects(prev => [...prev, effect]);
    
    Animated.timing(progress, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start(() => {
      setDeathEffects(prev => prev.filter(e => e.id !== effect.id));
    });
  };

  // Clouds
  useEffect(() => {
    const arr: Cloud[] = [];
    for (let i = 0; i < 5; i++) {
      arr.push({
        id: i,
        x: Math.random() * width,
        y: Math.random() * (height / 3) + 50,
        speed: 0.5 + Math.random() * 1,
        size: 0.8 + Math.random() * 0.4
      });
    }
    setClouds(arr);
  }, []);

  // Gradual difficulty scaling
  useEffect(() => {
    if (gameState === 'playing') {
      const lvl = Math.floor(score / 10);
      
      setPipeSpeed(INITIAL_PIPE_SPEED + lvl * 0.08);
      setPipeGap(Math.max(260, INITIAL_PIPE_GAP - lvl * 2));
      setPipeFrequency(Math.max(160, 200 - lvl * 2));
      
      const speedMultiplier = 1 + (lvl * 0.1);
      setCurrentGravity(INITIAL_GRAVITY * speedMultiplier);
      setCurrentFlapStrength(INITIAL_FLAP_STRENGTH * speedMultiplier);
    }
  }, [score, gameState]);

  const startGame = () => {
    setGameState('countdown');
    setScore(0);
    setBirdY(height / 2);
    birdVelocity.current = 0;
    setPipes([]);
    setBullets([]);
    setVillains([]);
    setDeathEffects([]);
    frameCount.current = 0;
    passedPipes.current = new Set();
    
    setPipeSpeed(INITIAL_PIPE_SPEED);
    setPipeGap(INITIAL_PIPE_GAP);
    setPipeFrequency(200);
    setCurrentGravity(INITIAL_GRAVITY);
    setCurrentFlapStrength(INITIAL_FLAP_STRENGTH);
    
    setCountdown(3);
    setLives(MAX_LIVES);
    setInvincible(false);
    lastHitTime.current = 0;
    lastVillainSpawn.current = Date.now();
    lastBulletSpawn.current = Date.now();
    lastPipeSpawn.current = Date.now();

    lastFrameTime.current = 0;

    overlayAnim.setValue(0);
    Animated.timing(overlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();

    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          Animated.timing(overlayAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
          setGameState('playing');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const flap = () => {
    if (gameState === 'playing') {
      birdVelocity.current = currentFlapStrength;
    }
  };

  // AUTO-SHOOT: Create new bullet
  const autoShoot = () => {
    if (gameState === 'playing') {
      const newBullet: Bullet = {
        id: Date.now() + Math.random(),
        x: 70 + BIRD_SIZE,
        y: birdY + BIRD_SIZE / 2 - BULLET_SIZE / 2
      };
      setBullets(prev => [...prev, newBullet]);
    }
  };

  const quitGame = async () => {
    if (Platform.OS === 'web') {
      if (webAudio) webAudio.pause();
    } else {
      if (sound) await sound.stopAsync();
    }
    setGameState('menu');
    overlayAnim.setValue(0);
  };

  const generatePipe = (): Pipe => {
    const minTopHeight = 120;
    const minBottomHeight = 120;
    const maxTopHeight = height - pipeGap - minBottomHeight - 140;
    const topHeight = Math.random() * (maxTopHeight - minTopHeight) + minTopHeight;
    return { id: Date.now(), x: width, topHeight, scored: false };
  };

  // FIX 2: Better villain spawn logic
  const generateVillain = (): Villain | null => {
    const safeZones = [];
    
    // Define safe spawn zones (avoid pipes and ground)
    for (let i = 0; i < 5; i++) {
      const x = width + Math.random() * 100;
      const y = Math.random() * (height - 200) + 100; // Avoid top and bottom edges
      
      // Check if this position is safe from pipes
      let isSafe = true;
      for (const pipe of pipes) {
        const pipeRight = pipe.x + PIPE_WIDTH;
        const pipeGapTop = pipe.topHeight;
        const pipeGapBottom = pipe.topHeight + pipeGap;
        
        // Check if villain would spawn inside or too close to pipes
        if (x < pipeRight + 100 && // 100px buffer
            ((y < pipeGapTop - 50) || (y + VILLAIN_SIZE > pipeGapBottom + 50))) {
          isSafe = false;
          break;
        }
      }
      
      // Also avoid ground
      if (y + VILLAIN_SIZE > height - 150) {
        isSafe = false;
      }
      
      if (isSafe) {
        safeZones.push({ x, y });
      }
    }
    
    if (safeZones.length > 0) {
      const spawn = safeZones[Math.floor(Math.random() * safeZones.length)];
      return {
        id: Date.now() + Math.random(),
        x: spawn.x,
        y: spawn.y,
        speedX: -VILLAIN_SPEED,
        speedY: 0,
        scaleAnim: new Animated.Value(1)
      };
    }
    
    return null;
  };

  const spawnVillainGroup = () => {
    const villain = generateVillain();
    if (villain) {
      setVillains(prev => [...prev, villain]);
    }
  };

  const loseLife = async () => {
    const now = Date.now();
    if (now - lastHitTime.current < 1000) return;
    lastHitTime.current = now;
    if (invincible) return;
    
    const newLives = lives - 1;
    if (newLives <= 0) {
      await playDeathSound();
    }
    
    setLives(prev => {
      const updatedLives = prev - 1;
      
      if (updatedLives <= 0) {
        endGame();
        return 0;
      }
      
      setInvincible(true);
      invincibleAnim.setValue(1);
      
      Animated.loop(
        Animated.sequence([
          Animated.timing(invincibleAnim, { 
            toValue: 0.6,
            duration: 200, 
            useNativeDriver: true 
          }),
          Animated.timing(invincibleAnim, { 
            toValue: 1, 
            duration: 200, 
            useNativeDriver: true 
          }),
        ]),
        { iterations: 4 }
      ).start(() => {
        invincibleAnim.setValue(1);
        setInvincible(false);
      });
      
      return updatedLives;
    });
  };

  const endGame = async () => {
    setGameState('gameover');
    if (score > highScore) setHighScore(score);
    if (Platform.OS === 'web') {
      if (webAudio) webAudio.pause();
    } else {
      if (sound) await sound.pauseAsync();
    }
  };

  // FIX 3: Optimized Game Loop with Performance Improvements
  useEffect(() => {
    if (gameState !== 'playing') return;
    let rafId = 0;

    const loop = (timestamp: number) => {
      // Frame rate limiting
      if (!lastFrameTime.current) lastFrameTime.current = timestamp;
      const deltaTime = timestamp - lastFrameTime.current;
      
      if (deltaTime < frameInterval) {
        rafId = requestAnimationFrame(loop);
        return;
      }
      
      lastFrameTime.current = timestamp;
      frameCount.current++;

      // Optimized clouds update (less frequent)
      if (frameCount.current % 3 === 0) {
        setClouds(prev => prev.map(c => ({ ...c, x: c.x - c.speed })).filter(c => c.x > -CLOUD_WIDTH));
      }

      // Bird physics
      birdVelocity.current += currentGravity;
      setBirdY(prev => {
        const newY = prev + birdVelocity.current;
        if (newY < 0 || newY > height - BIRD_SIZE - 100) {
          loseLife();
          return Math.max(0, Math.min(newY, height - BIRD_SIZE - 100));
        }
        return newY;
      });

      // Pipes
      const now = Date.now();
      if (now - lastPipeSpawn.current > 2500) {
        setPipes(prev => [...prev, generatePipe()]);
        lastPipeSpawn.current = now;
      }

      // AUTO-SHOOT
      if (now - lastBulletSpawn.current > 500) {
        autoShoot();
        lastBulletSpawn.current = now;
      }

      // Villains - spawn less frequently for better performance
      const villainSpawnRate = Math.max(5000, 6000 - score * 80);
      if (now - lastVillainSpawn.current > villainSpawnRate) {
        if (Math.random() < 0.4) {
          spawnVillainGroup();
        }
        lastVillainSpawn.current = now;
      }

      // Move bullets
      setBullets(prev => {
        const moved = prev.map(b => ({ ...b, x: b.x + BULLET_SPEED }));
        return moved.filter(b => b.x < width + 50);
      });

      // Move villains
      setVillains(prev => 
        prev.map(v => ({ 
          ...v, 
          x: v.x + v.speedX, 
          y: v.y + v.speedY 
        })).filter(v => v.x > -VILLAIN_SIZE * 2)
      );

      // Move pipes and handle collisions
      setPipes(prev => {
        const newPipes = prev.map(p => ({ ...p, x: p.x - pipeSpeed }));
        newPipes.forEach(pipe => {
          const birdX = 70;
          const birdRight = birdX + BIRD_SIZE;
          const birdBottom = birdY + BIRD_SIZE;
          
          if (!pipe.scored && pipe.x + PIPE_WIDTH < birdX) {
            pipe.scored = true;
            if (!passedPipes.current.has(pipe.id)) { 
              passedPipes.current.add(pipe.id); 
              setScore(s => s + 1); 
            }
          }
          
          if (!invincible && 
              birdRight > pipe.x && 
              birdX < pipe.x + PIPE_WIDTH && 
              (birdY < pipe.topHeight || birdBottom > pipe.topHeight + pipeGap)) {
            loseLife();
          }
        });
        return newPipes.filter(p => p.x > -PIPE_WIDTH);
      });

      // Bullet-villain collisions
      setBullets(prevBullets => {
        const remainingBullets = [...prevBullets];
        const hitVillainIds = new Set<number>();

        setVillains(prevVillains => {
          const remainingVillains = [...prevVillains];
          
          remainingBullets.forEach((bullet) => {
            remainingVillains.forEach((villain) => {
              const bulletRight = bullet.x + BULLET_SIZE;
              const bulletBottom = bullet.y + BULLET_SIZE;
              const villainRight = villain.x + VILLAIN_SIZE;
              const villainBottom = villain.y + VILLAIN_SIZE;
              
              const collision = 
                bullet.x < villainRight &&
                bulletRight > villain.x &&
                bullet.y < villainBottom &&
                bulletBottom > villain.y;
              
              if (collision) {
                hitVillainIds.add(villain.id);
                const idx = remainingBullets.findIndex(b => b.id === bullet.id);
                if (idx !== -1) remainingBullets.splice(idx, 1);
                setScore(s => s + 2);
                
                addDeathEffect(villain.x + VILLAIN_SIZE/2, villain.y + VILLAIN_SIZE/2);
                
                Animated.sequence([
                  Animated.timing(villain.scaleAnim, {
                    toValue: 1.5,
                    duration: 100,
                    useNativeDriver: true,
                  }),
                  Animated.timing(villain.scaleAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                  }),
                ]).start();
              }
            });
          });
          
          return remainingVillains.filter(v => !hitVillainIds.has(v.id));
        });

        return remainingBullets;
      });

      // Villain-bird collisions
      setVillains(prev => {
        const arr = [...prev];
        arr.forEach((villain) => {
          const birdX = 70;
          const birdRight = birdX + BIRD_SIZE;
          const birdBottom = birdY + BIRD_SIZE;
          const villainRight = villain.x + VILLAIN_SIZE;
          const villainBottom = villain.y + VILLAIN_SIZE;
          
          const collision = 
            birdRight - 10 > villain.x + 10 &&
            birdX + 10 < villainRight - 10 &&
            birdBottom - 10 > villain.y + 10 &&
            birdY + 10 < villainBottom - 10;
          
          if (!invincible && collision) {
            loseLife();
            addDeathEffect(
              (birdX + villain.x) / 2,
              (birdY + villain.y) / 2
            );
          }
        });
        return arr;
      });

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [gameState, birdY, score, pipeSpeed, invincible, pipeGap, pipeFrequency, lives, currentGravity, pipes]);

  const getRotationDeg = () => {
    const v = birdVelocity.current;
    if (v < 0) return -15;
    return Math.min(15, v * 2);
  };

  const renderHearts = () => (
    <View style={styles.heartsContainer}>
      {[...Array(MAX_LIVES)].map((_, idx) => (
        <Text key={idx} style={[styles.heart, idx >= lives && styles.heartLost]}>
          {idx < lives ? '❤️' : '🤍'}
        </Text>
      ))}
    </View>
  );

  const renderClouds = () => clouds.map(cloud => (
    <View key={cloud.id} style={[styles.cloud, { left: cloud.x, top: cloud.y, transform: [{ scale: cloud.size }] }]}>
      <View style={styles.cloudCircle} />
      <View style={[styles.cloudCircle, styles.cloudCircle2]} />
      <View style={[styles.cloudCircle, styles.cloudCircle3]} />
    </View>
  ));

  const MuteButton = () => (
    <TouchableOpacity style={styles.muteButton} onPress={toggleMute}>
      <Text style={styles.muteButtonText}>{isMuted ? '🔇' : '🔊'}</Text>
    </TouchableOpacity>
  );

  // Menu Screen
  if (gameState === 'menu') {
    return (
      <View style={styles.container}>
        {renderClouds()}
        <Text style={styles.title}>MAMA vs BANGLADESHI MIYA</Text>
        <View style={styles.highScoreContainer}>
          <Text style={styles.highScoreLabel}>HIGH SCORE</Text>
          <Text style={styles.highScoreValue}>{highScore}</Text>
        </View>
        <View style={styles.menuButtons}>
          <TouchableOpacity style={styles.playButton} onPress={startGame}>
            <Text style={styles.buttonText}>▶ PLAY</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quitButton} onPress={quitGame}>
            <Text style={styles.buttonText}>✕ QUIT</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.instructions}>
          Tap to flap • Auto-shooting enabled • Avoid pillars and villains!{'\n'}
          Character gets faster as you score higher!
        </Text>
        <MuteButton />
      </View>
    );
  }

  // Game Screen
  return (
    <TouchableOpacity 
      style={styles.gameContainer} 
      activeOpacity={1} 
      onPress={flap}
    >
      {/* FIX 4: Better background to prevent dark sky issues */}
      <View style={styles.skyBackground} />
      {renderClouds()}

      <View style={styles.topBar}>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>Score</Text>
          <Text style={styles.score}>{score}</Text>
          <Text style={styles.speedLevel}>
            Speed: {Math.floor((currentGravity / INITIAL_GRAVITY - 1) * 100)}%
          </Text>
        </View>
        {renderHearts()}
      </View>

      <MuteButton />

      {/* Hero character */}
      <Animated.Image
        source={require('../../assets/images/head.png')}
        style={[
          styles.birdImage,
          { 
            top: birdY, 
            left: 70, 
            transform: [
              { rotate: `${getRotationDeg()}deg` },
            ], 
            opacity: invincibleAnim
          }
        ]}
        resizeMode="contain"
      />

      {/* Auto-shooting bullets */}
      {bullets.map(b => (
        <View
          key={b.id}
          style={[
            styles.bullet,
            { left: b.x, top: b.y }
          ]}
        />
      ))}

      {/* Villains */}
      {villains.map(v => (
        <Animated.Image 
          key={v.id} 
          source={require('../../assets/images/friends.png')} 
          style={[
            styles.villain, 
            { 
              left: v.x, 
              top: v.y,
              transform: [{ scale: v.scaleAnim }]
            }
          ]} 
          resizeMode="contain" 
        />
      ))}

      {/* Death effects */}
      {deathEffects.map(effect => (
        <Animated.View
          key={effect.id}
          style={[
            styles.deathEffect,
            {
              left: effect.x - 30,
              top: effect.y - 30,
              opacity: effect.progress.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [1, 0.8, 0]
              }),
              transform: [
                {
                  scale: effect.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 2]
                  })
                }
              ]
            }
          ]}
        />
      ))}

      {/* Pipes */}
      {pipes.map(p => (
        <View key={p.id}>
          <View style={[styles.pipe, { left: p.x, height: p.topHeight, top: 0 }]}>
            <View style={styles.pipeTop} />
          </View>
          <View style={[
            styles.pipe, 
            { 
              left: p.x, 
              height: height - p.topHeight - pipeGap - 100, 
              top: p.topHeight + pipeGap 
            }
          ]}>
            <View style={styles.pipeBottom} />
          </View>
        </View>
      ))}

      <View style={styles.grass} />
      <View style={styles.ground} />

      {/* Countdown overlay */}
      {gameState === 'countdown' && (
        <Animated.View pointerEvents="none" style={[styles.countdownOverlay, { opacity: overlayAnim }]}>
          <Text style={styles.countdownText}>{countdown}</Text>
          <Text style={styles.getReadyText}>GET READY!</Text>
        </Animated.View>
      )}

      {/* Game over overlay */}
      {gameState === 'gameover' && (
        <View style={styles.gameOverOverlay}>
          <Text style={styles.gameOverText}>GAME OVER</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Score</Text>
              <Text style={styles.statValue}>{score}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Best</Text>
              <Text style={styles.statValue}>{highScore}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Max Speed</Text>
              <Text style={styles.statValue}>
                {Math.floor((currentGravity / INITIAL_GRAVITY - 1) * 100)}%
              </Text>
            </View>
          </View>
          <View style={styles.menuButtons}>
            <TouchableOpacity style={styles.playButton} onPress={startGame}>
              <Text style={styles.buttonText}>PLAY AGAIN</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quitButton} onPress={quitGame}>
              <Text style={styles.buttonText}>MENU</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#87CEEB', 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 20 
  },
  gameContainer: { 
    flex: 1, 
    backgroundColor: '#87CEEB' 
  },
  // FIX 4: Added solid sky background
  skyBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#87CEEB',
    zIndex: 0
  },
  title: { 
    fontSize: 42, 
    fontWeight: 'bold', 
    color: '#FFD700', 
    marginBottom: 30, 
    textAlign: 'center', 
    zIndex: 10 
  },
  highScoreContainer: { 
    backgroundColor: 'rgba(255,255,255,0.9)', 
    paddingHorizontal: 30, 
    paddingVertical: 15, 
    borderRadius: 15, 
    marginBottom: 40, 
    alignItems: 'center', 
    borderWidth: 3, 
    borderColor: '#FFD700', 
    zIndex: 10 
  },
  highScoreLabel: { 
    fontSize: 16, 
    color: '#666', 
    fontWeight: 'bold' 
  },
  highScoreValue: { 
    fontSize: 48, 
    fontWeight: 'bold', 
    color: '#FF6B6B' 
  },
  menuButtons: { 
    width: '100%', 
    gap: 15, 
    zIndex: 10 
  },
  playButton: { 
    backgroundColor: '#4ECDC4', 
    paddingVertical: 18, 
    borderRadius: 15, 
    alignItems: 'center', 
    elevation: 5 
  },
  quitButton: { 
    backgroundColor: '#FF6B6B', 
    paddingVertical: 18, 
    borderRadius: 15, 
    alignItems: 'center', 
    elevation: 5 
  },
  buttonText: { 
    fontSize: 22, 
    fontWeight: 'bold', 
    color: 'white' 
  },
  instructions: { 
    marginTop: 30, 
    fontSize: 16, 
    color: '#fff', 
    textAlign: 'center', 
    fontStyle: 'italic', 
    lineHeight: 22, 
    zIndex: 10 
  },
  countdownOverlay: { 
    position: 'absolute', 
    top: height / 3, 
    alignSelf: 'center', 
    alignItems: 'center', 
    zIndex: 200 
  },
  countdownText: { 
    fontSize: 120, 
    fontWeight: 'bold', 
    color: '#FFD700', 
    textShadowColor: 'rgba(0,0,0,0.3)', 
    textShadowOffset: { width: 4, height: 4 }, 
    textShadowRadius: 6 
  },
  getReadyText: { 
    fontSize: 32, 
    fontWeight: 'bold', 
    color: '#fff', 
    marginTop: 10 
  },
  topBar: { 
    position: 'absolute', 
    top: 40, 
    left: 0, 
    right: 0, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    zIndex: 90 
  },
  scoreBox: { 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    paddingHorizontal: 20, 
    paddingVertical: 10, 
    borderRadius: 12, 
    alignItems: 'center' 
  },
  scoreLabel: { 
    fontSize: 12, 
    color: '#fff', 
    fontWeight: 'bold' 
  },
  score: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    color: 'white' 
  },
  speedLevel: {
    fontSize: 10,
    color: '#FFD700',
    fontWeight: 'bold',
    marginTop: 2
  },
  heartsContainer: { 
    flexDirection: 'row', 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    paddingHorizontal: 15, 
    paddingVertical: 8, 
    borderRadius: 20 
  },
  heart: { 
    fontSize: 24, 
    marginHorizontal: 2 
  },
  heartLost: { 
    opacity: 0.5 
  },
  birdImage: { 
    position: 'absolute', 
    width: BIRD_SIZE, 
    height: BIRD_SIZE, 
    zIndex: 20 
  },
  statsContainer: { 
    flexDirection: 'row', 
    gap: 15, 
    marginBottom: 40, 
    zIndex: 10 
  },
  statBox: { 
    backgroundColor: 'rgba(255,255,255,0.9)', 
    padding: 20, 
    borderRadius: 15, 
    alignItems: 'center', 
    minWidth: 100, 
    borderWidth: 2, 
    borderColor: '#ddd' 
  },
  statLabel: { 
    fontSize: 14, 
    color: '#666', 
    fontWeight: 'bold' 
  },
  statValue: { 
    fontSize: 32, 
    fontWeight: 'bold', 
    color: '#333', 
    marginTop: 5 
  },
  gameOverOverlay: { 
    position: 'absolute', 
    top: 80, 
    left: 20, 
    right: 20, 
    alignItems: 'center', 
    zIndex: 300 
  },
  gameOverText: { 
    fontSize: 48, 
    fontWeight: 'bold', 
    color: '#FF6B6B', 
    marginBottom: 30, 
    textShadowColor: 'rgba(0,0,0,0.3)', 
    textShadowOffset: { width: 3, height: 3 }, 
    textShadowRadius: 5 
  },
  pipe: { 
    position: 'absolute', 
    width: PIPE_WIDTH, 
    backgroundColor: '#228B22', 
    borderWidth: 3, 
    borderColor: '#1a6b1a', 
    zIndex: 10 
  },
  pipeTop: { 
    position: 'absolute', 
    bottom: 0, 
    width: PIPE_WIDTH - 6, 
    height: 30, 
    backgroundColor: '#2a9d2a' 
  },
  pipeBottom: { 
    position: 'absolute', 
    top: 0, 
    width: PIPE_WIDTH - 6, 
    height: 30, 
    backgroundColor: '#2a9d2a' 
  },
  bullet: { 
    position: 'absolute', 
    width: BULLET_SIZE, 
    height: BULLET_SIZE, 
    backgroundColor: '#FF0000', 
    borderRadius: BULLET_SIZE / 2, 
    zIndex: 15, 
    elevation: 5 
  },
  villain: { 
    position: 'absolute', 
    width: VILLAIN_SIZE, 
    height: VILLAIN_SIZE, 
    zIndex: 12, 
    elevation: 4 
  },
  deathEffect: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF0000',
    zIndex: 16,
    elevation: 6,
  },
  cloud: { 
    position: 'absolute', 
    width: CLOUD_WIDTH, 
    height: CLOUD_HEIGHT, 
    zIndex: 1 
  },
  cloudCircle: { 
    position: 'absolute', 
    backgroundColor: 'white', 
    borderRadius: 50, 
    width: 50, 
    height: 50, 
    top: 0, 
    left: 10 
  },
  cloudCircle2: { 
    width: 40, 
    height: 40, 
    top: 5, 
    left: 20 
  },
  cloudCircle3: { 
    width: 35, 
    height: 35, 
    top: 15, 
    left: 50 
  },
  muteButton: { 
    position: 'absolute', 
    top: 20, 
    right: 20, 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    width: 50, 
    height: 50, 
    borderRadius: 25, 
    justifyContent: 'center', 
    alignItems: 'center', 
    zIndex: 100,
    elevation: 5 
  },
  muteButtonText: { 
    fontSize: 24, 
    color: 'white' 
  },
  grass: { 
    position: 'absolute', 
    bottom: 100, 
    width: '100%', 
    height: GRASS_HEIGHT, 
    backgroundColor: '#7CFC00', 
    zIndex: 5 
  },
  ground: { 
    position: 'absolute', 
    bottom: 0, 
    width: '100%', 
    height: 100, 
    backgroundColor: '#8B4513', 
    borderTopWidth: 4, 
    borderTopColor: '#654321', 
    zIndex: 5 
  }
});