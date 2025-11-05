// AUDIO DEBUG VERSION - Let's figure out what's wrong
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Dimensions, Animated, Image, Platform, Alert, ScrollView } from 'react-native';

const { width, height } = Dimensions.get('window');

// CONSTANTS
const BIRD_SIZE = 60;
const PIPE_WIDTH = 60;
const INITIAL_PIPE_GAP = 200;
const INITIAL_GRAVITY = 0.5;
const INITIAL_FLAP_STRENGTH = -8;
const INITIAL_PIPE_SPEED = 3.5;
const MAX_LIVES = 3;
const CLOUD_WIDTH = 100;
const CLOUD_HEIGHT = 60;
const GRASS_HEIGHT = 30;
const BULLET_SPEED = 12;
const BULLET_SIZE = 15;
const VILLAIN_SIZE = 120;
const VILLAIN_SPEED = 3.5;
const PLAYABLE_TOP = 100;
const PLAYABLE_BOTTOM = height - 130;

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
  const [lives, setLives] = useState(MAX_LIVES);
  const [invincible, setInvincible] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioStatus, setAudioStatus] = useState('Initializing...');
  const [showDebug, setShowDebug] = useState(true);

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

  const lastFrameTime = useRef(0);
  const targetFPS = 60;
  const frameInterval = 1000 / targetFPS;

  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const backgroundMusicRef = useRef<AudioBufferSourceNode | null>(null);
  const cachedAudioBufferRef = useRef<AudioBuffer | null>(null);

  // Initialize Audio Context
  useEffect(() => {
    const initAudio = async () => {
      try {
        setAudioStatus('Creating audio context...');
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(context);
        setAudioStatus(`Audio context created: ${context.state}`);
        
        if (context.state === 'suspended') {
          setAudioStatus('Audio suspended, will resume on user interaction');
        }
      } catch (error) {
        setAudioStatus(`❌ Audio context error: ${error}`);
        console.error('Audio context creation failed:', error);
      }
    };
    
    if (Platform.OS === 'web') {
      initAudio();
    }
  }, []);

  // Load Audio Files - WITH DETAILED LOGGING
  useEffect(() => {
    if (!audioContext) return;

    const loadAudio = async () => {
      try {
        // Your files are in: assets/sounds/background-music.mp3
        const pathsToTry = [
          'assets/sounds/background-music.mp3',
          './assets/sounds/background-music.mp3',
          '/assets/sounds/background-music.mp3',
        ];

        let response = null;
        let successPath = null;

        for (const path of pathsToTry) {
          try {
            setAudioStatus(`🔍 Trying: ${path}`);
            response = await fetch(path);
            if (response.ok) {
              successPath = path;
              setAudioStatus(`✅ Found at: ${path}`);
              break;
            }
          } catch (e) {
            setAudioStatus(`❌ Failed: ${path}`);
          }
        }

        if (!response || !response.ok) {
          setAudioStatus(`❌ All paths failed!\n\nYour files:\n• assets/sounds/background-music.mp3\n• assets/sounds/death-sound.mp3\n\nTry restarting dev server!`);
          return;
        }

        const arrayBuffer = await response.arrayBuffer();
        setAudioStatus(`📦 File size: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`);

        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        cachedAudioBufferRef.current = audioBuffer;
        setAudioStatus(`🎵 SUCCESS! Audio: ${audioBuffer.duration.toFixed(2)}s - Ready to play!`);
      } catch (error) {
        setAudioStatus(`❌ Decode error: ${error}`);
        console.error('Audio error:', error);
      }
    };

    loadAudio();
  }, [audioContext]);

  // Audio Playback Control
  useEffect(() => {
    if (!audioContext || !cachedAudioBufferRef.current) return;

    const shouldPlay = (gameState === 'playing' || gameState === 'countdown') && !isMuted;

    if (shouldPlay) {
      try {
        if (audioContext.state === 'suspended') {
          audioContext.resume().then(() => {
            setAudioStatus('Audio resumed');
          });
        }

        if (backgroundMusicRef.current) {
          try {
            backgroundMusicRef.current.stop();
          } catch (e) {}
        }

        const source = audioContext.createBufferSource();
        source.buffer = cachedAudioBufferRef.current;
        source.loop = true;
        source.connect(audioContext.destination);
        source.start(0);
        backgroundMusicRef.current = source;
        setAudioStatus(`🔊 Playing...`);
      } catch (error) {
        setAudioStatus(`❌ Playback error: ${error}`);
        console.error('Audio playback error:', error);
      }
    } else {
      if (backgroundMusicRef.current) {
        try {
          backgroundMusicRef.current.stop();
          backgroundMusicRef.current = null;
        } catch (e) {}
      }
      setAudioStatus('Audio stopped');
    }

    return () => {
      if (backgroundMusicRef.current) {
        try {
          backgroundMusicRef.current.stop();
          backgroundMusicRef.current = null;
        } catch (e) {}
      }
    };
  }, [gameState, isMuted, audioContext]);

  const toggleMute = () => {
    setIsMuted(prev => !prev);
  };

  const testAudioFile = async () => {
    try {
      setAudioStatus('Testing fetch to /assets/sounds/background-music.mp3...');
      const response = await fetch('/assets/sounds/background-music.mp3');
      const text = await response.text();
      setAudioStatus(`Response: ${response.status}, Content length: ${text.length}`);
    } catch (error) {
      setAudioStatus(`Fetch test failed: ${error}`);
    }
  };

  const playDeathSound = async () => {
    if (isMuted || !audioContext) return;
    
    try {
      const pathsToTry = [
        'assets/sounds/death-sound.mp3',
        './assets/sounds/death-sound.mp3',
        '/assets/sounds/death-sound.mp3',
      ];

      let response = null;
      for (const path of pathsToTry) {
        try {
          response = await fetch(path);
          if (response.ok) break;
        } catch (e) {}
      }

      if (!response || !response.ok) return;
      
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start(0);
    } catch (error) {
      console.log('Death sound error:', error);
    }
  };

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

  useEffect(() => {
    const arr: Cloud[] = [];
    for (let i = 0; i < 5; i++) {
      arr.push({
        id: i,
        x: Math.random() * width,
        y: Math.random() * (height / 3) + 50,
        speed: 0.8 + Math.random() * 1,
        size: 0.8 + Math.random() * 0.4
      });
    }
    setClouds(arr);
  }, []);

  useEffect(() => {
    if (gameState === 'playing') {
      const lvl = Math.floor(score / 5);
      
      setPipeSpeed(INITIAL_PIPE_SPEED + lvl * 0.15);
      setPipeGap(Math.max(180, INITIAL_PIPE_GAP - lvl * 3));
      
      const speedMultiplier = 1 + (lvl * 0.15);
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

  const quitGame = () => {
    setGameState('menu');
    overlayAnim.setValue(0);
  };

  const generatePipe = (): Pipe => {
    const minTopHeight = 100;
    const minBottomHeight = 100;
    const maxTopHeight = height - pipeGap - minBottomHeight - 140;
    const topHeight = Math.random() * (maxTopHeight - minTopHeight) + minTopHeight;
    return { id: Date.now(), x: width, topHeight, scored: false };
  };

  const generateVillain = (): Villain | null => {
    const minY = PLAYABLE_TOP + 20;
    const maxY = PLAYABLE_BOTTOM - VILLAIN_SIZE - 20;
    
    if (maxY <= minY) return null;
    
    const y = Math.random() * (maxY - minY) + minY;
    
    let isClear = true;
    for (const pipe of pipes) {
      const pipeRight = pipe.x + PIPE_WIDTH;
      const pipeGapTop = pipe.topHeight;
      const pipeGapBottom = pipe.topHeight + pipeGap;
      
      if (pipeRight > width - 200) {
        const villainBottom = y + VILLAIN_SIZE;
        if ((y < pipeGapTop - 100 || villainBottom > pipeGapBottom + 100)) {
          isClear = false;
          break;
        }
      }
    }
    
    if (isClear) {
      return {
        id: Date.now() + Math.random(),
        x: width,
        y: y,
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
            duration: 150, 
            useNativeDriver: true 
          }),
          Animated.timing(invincibleAnim, { 
            toValue: 1, 
            duration: 150, 
            useNativeDriver: true 
          }),
        ]),
        { iterations: 6 }
      ).start(() => {
        invincibleAnim.setValue(1);
        setInvincible(false);
      });
      
      return updatedLives;
    });
  };

  const endGame = () => {
    setGameState('gameover');
    if (score > highScore) setHighScore(score);
  };

  useEffect(() => {
    if (gameState !== 'playing') return;
    let rafId = 0;

    const loop = (timestamp: number) => {
      if (!lastFrameTime.current) lastFrameTime.current = timestamp;
      const deltaTime = timestamp - lastFrameTime.current;
      
      if (deltaTime < frameInterval) {
        rafId = requestAnimationFrame(loop);
        return;
      }
      
      lastFrameTime.current = timestamp;
      frameCount.current++;

      if (frameCount.current % 2 === 0) {
        setClouds(prev => prev.map(c => ({ ...c, x: c.x - c.speed })).filter(c => c.x > -CLOUD_WIDTH));
      }

      birdVelocity.current += currentGravity;
      setBirdY(prev => {
        const newY = prev + birdVelocity.current;
        if (newY < PLAYABLE_TOP || newY > PLAYABLE_BOTTOM - BIRD_SIZE) {
          loseLife();
          return Math.max(PLAYABLE_TOP, Math.min(newY, PLAYABLE_BOTTOM - BIRD_SIZE));
        }
        return newY;
      });

      const now = Date.now();
      
      if (now - lastPipeSpawn.current > 1800) {
        setPipes(prev => [...prev, generatePipe()]);
        lastPipeSpawn.current = now;
      }

      if (now - lastBulletSpawn.current > 400) {
        autoShoot();
        lastBulletSpawn.current = now;
      }

      const villainSpawnRate = 2500;
      if (now - lastVillainSpawn.current > villainSpawnRate) {
        spawnVillainGroup();
        lastVillainSpawn.current = now;
      }

      setBullets(prev => {
        const moved = prev.map(b => ({ ...b, x: b.x + BULLET_SPEED }));
        return moved.filter(b => b.x < width + 50);
      });

      setVillains(prev => 
        prev.map(v => {
          let newY = v.y + v.speedY;
          newY = Math.max(PLAYABLE_TOP, Math.min(newY, PLAYABLE_BOTTOM - VILLAIN_SIZE));
          return { 
            ...v,
            x: v.x + v.speedX,
            y: newY
          };
        }).filter(v => v.x > -VILLAIN_SIZE * 2)
      );

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

      setVillains(prev => {
        const arr = [...prev];
        arr.forEach((villain) => {
          const birdX = 70;
          const birdRight = birdX + BIRD_SIZE;
          const birdBottom = birdY + BIRD_SIZE;
          const villainRight = villain.x + VILLAIN_SIZE;
          const villainBottom = villain.y + VILLAIN_SIZE;
          
          const collision = 
            birdRight > villain.x &&
            birdX < villainRight &&
            birdBottom > villain.y &&
            birdY < villainBottom;
          
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
  }, [gameState, birdY, score, pipeSpeed, invincible, pipeGap, lives, currentGravity, pipes, currentFlapStrength]);

  const getRotationDeg = () => {
    const v = birdVelocity.current;
    if (v < 0) return -20;
    return Math.min(25, v * 2);
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

  if (gameState === 'menu') {
    return (
      <View style={styles.container}>
        {renderClouds()}
        <Text style={styles.title}>MAMA vs BANGLADESHI MIYA</Text>
        
        {showDebug && (
          <View style={styles.debugBox}>
            <View style={styles.debugHeader}>
              <Text style={styles.debugTitle}>🔧 AUDIO DEBUG</Text>
              <TouchableOpacity onPress={() => setShowDebug(false)}>
                <Text style={styles.debugClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.debugContent}>
              <Text style={styles.debugText}>{audioStatus}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.debugButton} onPress={testAudioFile}>
              <Text style={styles.debugButtonText}>Test Audio File</Text>
            </TouchableOpacity>
          </View>
        )}

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
          FAST-PACED GAMEPLAY - Matching Mobile Experience!
        </Text>
        <MuteButton />
      </View>
    );
  }

  return (
    <TouchableOpacity 
      style={styles.gameContainer} 
      activeOpacity={1} 
      onPress={flap}
    >
      <View style={styles.skyBackground} />
      {renderClouds()}

      <View style={styles.topBar}>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>Score</Text>
          <Text style={styles.score}>{score}</Text>
          <Text style={styles.speedLevel}>
            Speed: +{Math.floor((currentGravity / INITIAL_GRAVITY - 1) * 100)}%
          </Text>
        </View>
        {renderHearts()}
      </View>

      <MuteButton />

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

      {bullets.map(b => (
        <View
          key={b.id}
          style={[
            styles.bullet,
            { left: b.x, top: b.y }
          ]}
        />
      ))}

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

      {gameState === 'countdown' && (
        <Animated.View pointerEvents="none" style={[styles.countdownOverlay, { opacity: overlayAnim }]}>
          <Text style={styles.countdownText}>{countdown}</Text>
          <Text style={styles.getReadyText}>GET READY!</Text>
        </Animated.View>
      )}

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
                +{Math.floor((currentGravity / INITIAL_GRAVITY - 1) * 100)}%
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
    marginBottom: 20, 
    textAlign: 'center', 
    zIndex: 10 
  },
  debugBox: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    width: '100%',
    maxHeight: 200,
    borderWidth: 2,
    borderColor: '#FF6B6B'
  },
  debugHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700'
  },
  debugClose: {
    fontSize: 18,
    color: '#FF6B6B'
  },
  debugContent: {
    maxHeight: 120,
    marginBottom: 10
  },
  debugText: {
    fontSize: 12,
    color: '#00FF00',
    fontFamily: 'monospace',
    lineHeight: 18
  },
  debugButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center'
  },
  debugButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'white'
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
    marginTop: 20, 
    fontSize: 14, 
    color: '#fff', 
    textAlign: 'center', 
    fontStyle: 'italic', 
    lineHeight: 20, 
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