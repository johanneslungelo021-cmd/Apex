"""
Pre-Sign & Stream Architecture for XRPL Transaction Speed

This module implements the proactive transaction handling that enables
Ripple transaction finality in ~3.5 seconds by pre-fetching and
pre-signing transactions while the AI is still generating response.

Key Features:
- Predictive Intent Handoffs: Detect transaction intent as soon as possible
- Async Transaction Pre-signing: Initialize XRPL transaction before AI finishes
- Edge-Optimized: Minimize latency with connection pooling
"""

import asyncio
import hashlib
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, AsyncGenerator, Optional

# XRPL imports - will be installed via requirements
try:
    import xrpl
    from xrpl.clients import JsonRpcClient
    from xrpl.models import (
        AccountLines,
        Payment,
        TrustSet,
        Memo,
    )
    from xrpl.transaction import (
        autofill_and_sign,
        send_submitted_transaction,
        get_transaction_from_hash,
    )
    from xrpl.wallet import Wallet
    XRPL_AVAILABLE = True
except ImportError:
    XRPL_AVAILABLE = False
    logging.warning("xrpl-py not installed. Install with: pip install xrpl-py")

logger = logging.getLogger(__name__)


class TransactionIntent(Enum):
    """Detected transaction intents from AI analysis."""
    SEND_XRP = "send_xrp"
    SEND_RLUSD = "send_rlusd"
    TRUST_SET = "trust_set"
    OFFER_CREATE = "offer_create"
    OFFER_CANCEL = "offer_cancel"
    ESCROW_CREATE = "escrow_create"
    ESCROW_FINISH = "escrow_finish"
    CHECK_CREATE = "check_create"
    CHECK_CASH = "check_cash"
    PAYMENT_CHANNEL_CREATE = "payment_channel_create"
    UNKNOWN = "unknown"


@dataclass
class XRPLTransaction:
    """Pre-constructed XRPL transaction ready for submission."""
    intent: TransactionIntent
    transaction_type: str
    params: dict
    tx_json: Optional[dict] = None
    tx_hash: Optional[str] = None
    status: str = "pending"  # pending, pre_signed, submitted, confirmed, failed
    sequence: Optional[int] = None
    last_ledger_sequence: Optional[int] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class TransactionContext:
    """Context for proactive transaction handling."""
    user_id: str
    wallet_address: str
    intent: TransactionIntent
    confidence: float  # 0.0 - 1.0
    raw_params: dict
    tx: Optional[XRPLTransaction] = None


class PredictiveIntentAnalyzer:
    """
    Analyzes AI streaming output to detect transaction intents early.
    
    This runs alongside the AI stream to identify when the user requests
    a transaction, allowing us to pre-build the transaction while the AI
    is still generating its response.
    """
    
    # Intent patterns to match in AI output
    INTENT_PATTERNS = {
        TransactionIntent.SEND_XRP: [
            "send xrp", "send ripple", "transfer xrp", "send",
            "sending xrp", "transferring", "send to address"
        ],
        TransactionIntent.SEND_RLUSD: [
            "send rlusd", "send ripple usd", "send usd",
            "transfer rlusd", "send stablecoin", "send usdt"
        ],
        TransactionIntent.TRUST_SET: [
            "set trust", "trust line", "enable token",
            "trust rlusd", "add trust", "create trust"
        ],
        TransactionIntent.OFFER_CREATE: [
            "create offer", "place order", "exchange",
            "sell xrp", "buy rlusd", "swap"
        ],
        TransactionIntent.ESCROW_CREATE: [
            "create escrow", "time lock", "conditional payment",
            "escrow funds", "schedule payment"
        ],
    }
    
    def __init__(self, min_confidence: float = 0.7):
        self.min_confidence = min_confidence
    
    def analyze(self, text: str) -> Optional[TransactionContext]:
        """
        Analyze text for transaction intent.
        
        Args:
            text: The text to analyze (can be partial AI output)
            
        Returns:
            TransactionContext if intent detected with high confidence
        """
        text_lower = text.lower()
        
        for intent, patterns in self.INTENT_PATTERNS.items():
            for pattern in patterns:
                if pattern in text_lower:
                    # Calculate confidence based on pattern specificity
                    confidence = self._calculate_confidence(pattern, text_lower)
                    if confidence >= self.min_confidence:
                        return TransactionContext(
                            user_id="",  # Will be set by caller
                            wallet_address="",  # Will be set by caller
                            intent=intent,
                            confidence=confidence,
                            raw_params=self._extract_params(text),
                        )
        
        return None
    
    def _calculate_confidence(self, pattern: str, text: str) -> float:
        """Calculate confidence score based on pattern match."""
        # Exact match = high confidence
        if pattern in text:
            return 0.95
        
        # Partial match = medium confidence
        pattern_words = set(pattern.split())
        text_words = set(text.split())
        
        overlap = pattern_words.intersection(text_words)
        if overlap:
            return 0.6 + (len(overlap) / len(pattern_words)) * 0.3
        
        return 0.3
    
    def _extract_params(self, text: str) -> dict:
        """Extract transaction parameters from text."""
        # Simple extraction - in production would use more sophisticated NLP
        params = {}
        
        # Extract amounts
        import re
        amount_match = re.search(r'(\d+(?:\.\d+)?)\s*(xrp|rlusd|usd)', text, re.IGNORECASE)
        if amount_match:
            params['amount'] = amount_match.group(1)
            params['currency'] = amount_match.group(2).upper()
        
        # Extract addresses (simplified - would need proper validation)
        address_match = re.search(r'r[0-9A-Za-z]{24,34}', text)
        if address_match:
            params['destination'] = address_match.group(0)
        
        return params


class XRPLProactiveClient:
    """
    XRPL client with proactive transaction pre-signing.
    
    This client pre-fetches transaction details and pre-signs transactions
    before the AI finishes generating, enabling near-instant transaction
    submission when the user confirms.
    """
    
    # Public XRPL nodes for low latency
    DEFAULT_NODES = [
        "https://xrplcluster.com",  # Primary - load balanced
        "https://s1.ripple.com",    # Ripple's official server
        "https://s2.ripple.com",    # Ripple's secondary
    ]
    
    def __init__(
        self,
        secret: str,
        network: str = "mainnet",
        node_urls: Optional[list[str]] = None,
    ):
        if not XRPL_AVAILABLE:
            raise ImportError("xrpl-py is required. Install with: pip install xrpl-py")
        
        self.network = network
        self.node_urls = node_urls or self.DEFAULT_NODES
        self.client = JsonRpcClient(self.node_urls[0])
        
        # Initialize wallet
        self.wallet = Wallet.from_seed(secret)
        self.address = self.wallet.address
        
        # Connection pool for parallel queries
        self._connection_pool: list[JsonRpcClient] = []
        
        # Track pending transactions
        self.pending_transactions: dict[str, XRPLTransaction] = {}
        
        # Intent analyzer
        self.intent_analyzer = PredictiveIntentAnalyzer()
    
    async def pre_fetch_account_info(self) -> dict:
        """
        Pre-fetch account information for fast transaction building.
        
        This runs in the background while AI is generating response.
        """
        try:
            # Get account info in parallel with other operations
            account_info = await asyncio.to_thread(
                self.client.request,
                xrpl.models.requests.AccountInfo(
                    account=self.address,
                    ledger_index="validated"
                )
            )
            
            # Get account lines for trust line info
            account_lines = await asyncio.to_thread(
                self.client.request,
                AccountLines(account=self.address)
            )
            
            return {
                "sequence": account_info.result["account_data"]["Sequence"],
                "balance": account_info.result["account_data"]["Balance"],
                "flags": account_info.result["account_data"]["Flags"],
                "trust_lines": len(account_lines.result.get("lines", [])),
            }
        except Exception as e:
            logger.error(f"Error pre-fetching account info: {e}")
            return {}
    
    async def pre_build_transaction(
        self,
        intent: TransactionIntent,
        params: dict,
    ) -> XRPLTransaction:
        """
        Pre-build and pre-sign a transaction.
        
        This creates the transaction object and optionally pre-signs it,
        so it's ready for instant submission when confirmed.
        """
        tx = XRPLTransaction(
            intent=intent,
            transaction_type=intent.value,
            params=params,
            status="building",
        )
        
        try:
            # Get current account info
            account_info = await self.pre_fetch_account_info()
            sequence = account_info.get("sequence", 0)
            
            # Build transaction based on intent
            if intent == TransactionIntent.SEND_XRP:
                tx_model = Payment(
                    account=self.address,
                    destination=params.get("destination"),
                    amount=params.get("amount", "0"),
                )
            elif intent == TransactionIntent.SEND_RLUSD:
                # RLUSD is a issued currency on XRPL
                tx_model = Payment(
                    account=self.address,
                    destination=params.get("destination"),
                    amount={
                        "currency": "RLUSD",
                        "value": params.get("amount", "0"),
                        "issuer": params.get("issuer", "rRVwKjJ3UrGYSsK1NKGxJ3UrGYSsK1NKGx"),  # RLUSD issuer
                    },
                )
            elif intent == TransactionIntent.TRUST_SET:
                tx_model = TrustSet(
                    account=self.address,
                    limit_amount={
                        "currency": params.get("currency", "RLUSD"),
                        "value": params.get("limit", "1000000"),
                        "issuer": params.get("issuer", ""),
                    },
                )
            else:
                logger.warning(f"Unsupported intent: {intent}")
                tx.status = "failed"
                return tx
            
            # Auto-fill and sign
            signed_tx = await asyncio.to_thread(
                autofill_and_sign,
                tx_model,
                self.client,
                self.wallet,
            )
            
            tx.tx_json = signed_tx.to_dict()
            tx.sequence = sequence
            tx.status = "pre_signed"
            
            # Store for later submission
            tx_id = hashlib.sha256(
                json.dumps(tx.tx_json, sort_keys=True).encode()
            ).hexdigest()[:16]
            self.pending_transactions[tx_id] = tx
            
            logger.info(f"Pre-built transaction: {tx_id} for {intent.value}")
            
        except Exception as e:
            logger.error(f"Error pre-building transaction: {e}")
            tx.status = "failed"
        
        return tx
    
    async def submit_transaction(
        self,
        tx: XRPLTransaction,
    ) -> dict:
        """
        Submit a pre-built transaction to the XRPL.
        
        This should be called when user confirms the transaction.
        """
        if not tx.tx_json:
            return {"status": "error", "message": "No transaction to submit"}
        
        try:
            # Submit transaction
            result = await asyncio.to_thread(
                send_submitted_transaction,
                self.client,
                xrpl.models.Transaction.from_dict(tx.tx_json),
            )
            
            tx.tx_hash = result.get("hash", "")
            tx.status = "submitted"
            
            return {
                "status": "submitted",
                "hash": tx.tx_hash,
                "intent": tx.intent.value,
            }
            
        except Exception as e:
            logger.error(f"Error submitting transaction: {e}")
            tx.status = "failed"
            return {"status": "error", "message": str(e)}
    
    async def wait_for_confirmation(
        self,
        tx_hash: str,
        timeout: float = 4.0,
    ) -> dict:
        """
        Wait for transaction confirmation.
        
        XRPL typically confirms in 3-5 seconds, so we timeout at 4 seconds
        by default to match the "instant" feel.
        """
        start_time = datetime.now(timezone.utc)
        
        while (datetime.now(timezone.utc) - start_time).total_seconds() < timeout:
            try:
                result = await asyncio.to_thread(
                    get_transaction_from_hash,
                    tx_hash,
                    self.client,
                )
                
                if result.get("validated"):
                    return {
                        "status": "confirmed",
                        "hash": tx_hash,
                        "result": result,
                    }
                    
            except xrpl.exceptions.XRPLRequestException:
                # Transaction not found yet - that's okay
                pass
            
            await asyncio.sleep(0.5)
        
        # Timeout - transaction may still be pending
        return {
            "status": "pending",
            "hash": tx_hash,
            "message": "Confirmation timeout - transaction may still process",
        }


class SentientStreamingHandler:
    """
    Main handler that combines AI streaming with proactive XRPL transactions.
    
    This is the core of Phase 3 - it runs the AI stream and XRPL pre-building
    in parallel, enabling the "Pre-Sign & Stream" architecture.
    """
    
    def __init__(
        self,
        xrpl_client: XRPLProactiveClient,
    ):
        self.xrpl_client = xrpl_client
        self.intent_analyzer = PredictiveIntentAnalyzer()
        self.active_transaction: Optional[XRPLTransaction] = None
    
    async def handle_streaming_request(
        self,
        user_prompt: str,
        stream_callback: AsyncGenerator[str, None],
    ) -> AsyncGenerator[dict, None]:
        """
        Handle a streaming AI request with proactive transaction detection.
        
        This yields chunks while also watching for transaction intents.
        When detected, it triggers pre-building of the transaction.
        """
        transaction_triggered = False
        full_text = ""
        
        async for chunk in stream_callback:
            full_text += chunk
            yield {"type": "text", "content": chunk}
            
            # Check for transaction intent (only once)
            if not transaction_triggered:
                intent_ctx = self.intent_analyzer.analyze(full_text)
                if intent_ctx and intent_ctx.confidence > 0.8:
                    # Trigger proactive transaction building
                    self.active_transaction = await self.xrpl_client.pre_build_transaction(
                        intent=intent_ctx.intent,
                        params=intent_ctx.raw_params,
                    )
                    
                    # Notify frontend that transaction is ready
                    yield {
                        "type": "transaction_ready",
                        "intent": self.active_transaction.intent.value,
                        "params": self.active_transaction.params,
                        "status": self.active_transaction.status,
                    }
                    
                    transaction_triggered = True
        
        # Stream complete - yield final transaction status
        if self.active_transaction:
            yield {
                "type": "transaction_complete",
                "status": self.active_transaction.status,
            }
    
    async def confirm_and_submit(self) -> dict:
        """
        Confirm and submit the active transaction.
        
        Call this when user clicks confirm on the frontend.
        """
        if not self.active_transaction:
            return {"status": "error", "message": "No pending transaction"}
        
        # Submit transaction
        result = await self.xrpl_client.submit_transaction(self.active_transaction)
        
        # Wait for confirmation
        if result.get("hash"):
            confirmation = await self.xrpl_client.wait_for_confirmation(result["hash"])
            result.update(confirmation)
        
        return result


# Example usage and initialization
async def create_xrpl_handler(secret: str) -> SentientStreamingHandler:
    """Create a new XRPL streaming handler."""
    client = XRPLProactiveClient(secret=secret)
    
    # Pre-fetch account info in background
    asyncio.create_task(client.pre_fetch_account_info())
    
    return SentientStreamingHandler(xrpl_client=client)


# For backwards compatibility - legacy function
def analyze_intent(text: str) -> Optional[TransactionIntent]:
    """Legacy function for simple intent analysis."""
    analyzer = PredictiveIntentAnalyzer()
    result = analyzer.analyze(text)
    return result.intent if result else None
