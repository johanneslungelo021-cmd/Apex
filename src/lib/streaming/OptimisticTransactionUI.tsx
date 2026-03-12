/**
 * Sentient Financial Engine - Optimistic UI Components
 * 
 * Phase 3: Pre-Sign & Stream Architecture
 * 
 * These components create the "breathtaking" visual feedback for XRPL transactions,
 * implementing the Speculative Settlement pattern where we show success before
 * the ledger confirms.
 * 
 * Key Features:
 * - Optimistic Settlement: Show transaction success immediately
 * - Visual beam effects when transaction hits the ledger
 * - Glitch fallback on transaction failure
 * - Haptic-like visual feedback
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Types for transaction events from the streaming AI
export interface TransactionIntent {
  type: string;
  amount?: string;
  currency?: string;
  destination?: string;
  hash?: string;
  status: 'pending' | 'pre_signed' | 'submitted' | 'confirmed' | 'failed';
}

export interface TransactionEvent {
  type: 'transaction_ready' | 'transaction_submitted' | 'transaction_confirmed' | 'transaction_failed';
  intent: TransactionIntent;
  timestamp: number;
}

/**
 * OptimisticTransactionState - Manages the optimistic UI state
 * 
 * This hook manages the visual state of transactions, showing optimistic
 * success immediately while the actual confirmation comes in the background.
 */
export function useOptimisticTransaction() {
  const [transactionState, setTransactionState] = useState<{
    status: 'idle' | 'pending' | 'optimistic_success' | 'confirmed' | 'failed';
    intent: TransactionIntent | null;
    hash: string | null;
    error: string | null;
  }>({
    status: 'idle',
    intent: null,
    hash: null,
    error: null,
  });

  const resetTransaction = useCallback(() => {
    setTransactionState({
      status: 'idle',
      intent: null,
      hash: null,
      error: null,
    });
  }, []);

  const startTransaction = useCallback((intent: TransactionIntent) => {
    setTransactionState({
      status: 'pending',
      intent,
      hash: null,
      error: null,
    });
  }, []);

  const markOptimisticSuccess = useCallback((hash: string) => {
    setTransactionState(prev => ({
      ...prev,
      status: 'optimistic_success',
      hash,
    }));
  }, []);

  const confirmTransaction = useCallback((hash: string) => {
    setTransactionState(prev => ({
      ...prev,
      status: 'confirmed',
      hash,
    }));
  }, []);

  const failTransaction = useCallback((error: string) => {
    setTransactionState(prev => ({
      ...prev,
      status: 'failed',
      error,
    }));
  }, []);

  return {
    transactionState,
    resetTransaction,
    startTransaction,
    markOptimisticSuccess,
    confirmTransaction,
    failTransaction,
  };
}

/**
 * TransactionBeam - Visual effect when transaction hits the XRPL node
 * 
 * This component creates a volumetric laser beam effect when a transaction
 * is submitted to the ledger, giving visceral confirmation.
 */
interface TransactionBeamProps {
  isActive: boolean;
  startColor?: string;
  endColor?: string;
  onComplete?: () => void;
}

export function TransactionBeam({
  isActive,
  startColor = '#00FF88',
  endColor = '#00AAFF',
  onComplete,
}: TransactionBeamProps) {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{
            opacity: [0, 1, 1, 0],
            scale: [0.5, 1.2, 1, 0.8],
          }}
          exit={{ opacity: 0, scale: 0 }}
          transition={{
            duration: 1.5,
            times: [0, 0.2, 0.6, 1],
            ease: 'easeOut',
          }}
          onAnimationComplete={onComplete}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '200px',
            height: '200px',
            background: `radial-gradient(circle, ${startColor} 0%, ${endColor} 50%, transparent 70%)`,
            filter: 'blur(20px)',
            pointerEvents: 'none',
            zIndex: 100,
          }}
        />
      )}
    </AnimatePresence>
  );
}

/**
 * OptimisticTransactionCard - Shows transaction with speculative success
 * 
 * This is the main component users see. It shows the transaction as
 * successful immediately (optimistic), then updates when real confirmation arrives.
 */
interface OptimisticTransactionCardProps {
  intent: TransactionIntent | null;
  status: 'idle' | 'pending' | 'optimistic_success' | 'confirmed' | 'failed';
  hash: string | null;
  error: string | null;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function OptimisticTransactionCard({
  intent,
  status,
  hash,
  error,
  onConfirm,
  onCancel,
}: OptimisticTransactionCardProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'optimistic_success':
      case 'confirmed':
        return '#00FF88';
      case 'failed':
        return '#FF4444';
      case 'pending':
        return '#FFAA00';
      default:
        return '#888888';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'optimistic_success':
        return 'Transaction Submitted';
      case 'confirmed':
        return 'Confirmed on Ledger';
      case 'failed':
        return 'Transaction Failed';
      case 'pending':
        return 'Processing...';
      default:
        return 'Ready to Confirm';
    }
  };

  const getGlowEffect = () => {
    if (status === 'optimistic_success' || status === 'confirmed') {
      return '0 0 30px rgba(0, 255, 136, 0.5), 0 0 60px rgba(0, 255, 136, 0.3)';
    }
    if (status === 'failed') {
      return '0 0 30px rgba(255, 68, 68, 0.5), 0 0 60px rgba(255, 68, 68, 0.3)';
    }
    return 'none';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ 
        opacity: status === 'idle' ? 0 : 1,
        y: status === 'idle' ? 20 : 0,
      }}
      exit={{ opacity: 0, y: -20 }}
      style={{
        background: 'rgba(0, 0, 0, 0.8)',
        borderRadius: '16px',
        padding: '24px',
        border: `1px solid ${getStatusColor()}`,
        boxShadow: getGlowEffect(),
        backdropFilter: 'blur(10px)',
        maxWidth: '400px',
        margin: '0 auto',
      }}
    >
      {/* Status indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <motion.div
          animate={
            status === 'pending'
              ? { scale: [1, 1.2, 1] }
              : status === 'optimistic_success'
              ? { scale: [1, 1.5, 1] }
              : {}
          }
          transition={{ repeat: status === 'pending' ? Infinity : 0, duration: 1 }}
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: getStatusColor(),
          }}
        />
        <span style={{ color: getStatusColor(), fontWeight: 600 }}>
          {getStatusText()}
        </span>
      </div>

      {/* Transaction details */}
      {intent && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: '#888', fontSize: '12px', marginBottom: '4px' }}>
            Transaction Type
          </div>
          <div style={{ color: '#FFF', fontSize: '18px', fontWeight: 600, textTransform: 'capitalize' }}>
            {intent.type.replace(/_/g, ' ')}
          </div>
          
          {intent.amount && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ color: '#888', fontSize: '12px', marginBottom: '4px' }}>
                Amount
              </div>
              <div style={{ color: '#00FF88', fontSize: '24px', fontWeight: 700 }}>
                {intent.amount} {intent.currency || 'XRP'}
              </div>
            </div>
          )}
          
          {intent.destination && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ color: '#888', fontSize: '12px', marginBottom: '4px' }}>
                To
              </div>
              <div style={{ color: '#FFF', fontSize: '14px', fontFamily: 'monospace' }}>
                {intent.destination.slice(0, 10)}...{intent.destination.slice(-6)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hash display */}
      {hash && (
        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
          <div style={{ color: '#888', fontSize: '12px', marginBottom: '4px' }}>
            Transaction Hash
          </div>
          <div style={{ color: '#00AAFF', fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {hash}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          style={{
            marginTop: '16px',
            padding: '12px',
            background: 'rgba(255, 68, 68, 0.1)',
            borderRadius: '8px',
            border: '1px solid #FF4444',
          }}
        >
          <div style={{ color: '#FF4444', fontSize: '14px' }}>
            {error}
          </div>
        </motion.div>
      )}

      {/* Action buttons */}
      {status === 'idle' && onConfirm && (
        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '14px 24px',
              background: 'linear-gradient(135deg, #00FF88 0%, #00AAFF 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#000',
              fontWeight: 700,
              fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            Confirm Transaction
          </motion.button>
          
          {onCancel && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onCancel}
              style={{
                padding: '14px 24px',
                background: 'transparent',
                border: '1px solid #666',
                borderRadius: '8px',
                color: '#888',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </motion.button>
          )}
        </div>
      )}

      {/* Glitch effect for failures */}
      {status === 'failed' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0, 1, 0, 1] }}
          transition={{ duration: 0.3, times: [0, 0.2, 0.4, 0.6, 0.8, 1] }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(255, 0, 0, 0.1)',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        />
      )}
    </motion.div>
  );
}

/**
 * NDJSONStreamParser - Parses streaming NDJSON from AI agent
 * 
 * This hook parses the NDJSON stream from the AI agent and extracts
 * transaction events for the optimistic UI.
 */
export function useNDJSONStream(
  stream: ReadableStream<Uint8Array> | null,
  onTransactionReady?: (intent: TransactionIntent) => void,
  onTransactionConfirmed?: (hash: string) => void,
) {
  const [chunks, setChunks] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const processLine = useCallback((line: string) => {
    if (!line.trim()) return;
    
    try {
      const data = JSON.parse(line);
      
      // Handle transaction events
      if (data.type === 'transaction_ready') {
        onTransactionReady?.(data.intent);
      } else if (data.type === 'transaction_confirmed') {
        onTransactionConfirmed?.(data.hash);
      }
    } catch {
      // Non-JSON line in stream — treat as plain text chunk
      setChunks(prev => prev + line);
    }
  }, [onTransactionReady, onTransactionConfirmed]);

  const startStream = useCallback(async () => {
    if (!stream) return;
    
    setIsStreaming(true);
    const decoder = new TextDecoder();
    readerRef.current = stream.getReader();
    
    try {
      while (true) {
        const { done, value } = await readerRef.current.read();
        
        if (done) break;
        
        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');
        
        for (const line of lines) {
          processLine(line);
        }
      }
    } catch (e) {
      console.error('Stream error:', e);
    } finally {
      setIsStreaming(false);
    }
  }, [stream, processLine]);

  const cancelStream = useCallback(() => {
    readerRef.current?.cancel();
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    return () => {
      readerRef.current?.cancel();
    };
  }, []);

  return {
    chunks,
    isStreaming,
    startStream,
    cancelStream,
  };
}

/**
 * StreamingTypography - Cinematic text rendering engine
 * 
 * This component creates the "Cognitive UI" by applying micro-physics
 * to every word as it arrives from the NDJSON stream.
 */
interface StreamingTypographyProps {
  text: string;
  speed?: number;
  variant?: 'default' | 'thinking' | 'alert';
}

export function StreamingTypography({
  text,
  speed = 0.03,
  variant = 'default',
}: StreamingTypographyProps) {
  const words = text.split(' ');
  
  const getVariantStyles = () => {
    switch (variant) {
      case 'thinking':
        return {
          filter: 'blur(0.5px)',
          opacity: 0.8,
        };
      case 'alert':
        return {
          color: '#FF4444',
          textShadow: '0 0 10px rgba(255, 68, 68, 0.5)',
        };
      default:
        return {};
    }
  };

  return (
    <div style={{
      fontFamily: '"SF Mono", "Fira Code", monospace',
      fontSize: '16px',
      lineHeight: '1.8',
      ...getVariantStyles(),
    }}>
      {words.map((word, index) => (
        <motion.span
          key={index}
          initial={{
            opacity: 0,
            y: 10,
            filter: 'blur(4px)',
          }}
          animate={{
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
          }}
          transition={{
            duration: speed * 5,
            delay: index * speed,
            ease: [0.2, 0.8, 0.2, 1], // cubic-bezier for organic feel
          }}
          style={{
            display: 'inline-block',
            marginRight: '0.25em',
          }}
        >
          {word}
        </motion.span>
      ))}
    </div>
  );
}
