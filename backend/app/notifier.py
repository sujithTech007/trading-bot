import requests
import threading
from typing import Dict, Any
from app.config import load_settings

def _send_telegram_async(bot_token: str, chat_id: str, message: str) -> None:
    """Helper function to run the Telegram API request in a background thread."""
    if not bot_token or not chat_id:
        print("Telegram bot token or chat ID is missing. Notification skipped.")
        return
        
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "Markdown"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=5)
        if response.status_code != 200:
            print(f"Failed to send Telegram notification: {response.text}")
        else:
            print("Telegram notification sent successfully.")
    except Exception as e:
        print(f"Error sending Telegram notification: {e}")

def send_telegram_alert(signal: Dict[str, Any]) -> None:
    """Send a formatted trading signal to the configured Telegram chat."""
    settings = load_settings()
    bot_token = settings.telegram_bot_token
    chat_id = settings.telegram_chat_id
    
    if not bot_token or not chat_id:
        return
        
    # Format the message nicely for Telegram markdown
    direction_emoji = "🟢 *BUY*" if signal["direction"] == "BUY" else "🔴 *SELL*"
    reasons_str = "\n".join([f"• {r}" for r in signal.get("confluence_reasons", [])])
    
    message = (
        f"⚡️ *GOLD SIGNAL desk ALERT* ⚡️\n\n"
        f"Pair: *{signal['pair']}*\n"
        f"Action: {direction_emoji}\n"
        f"Session: *{signal['session']}*\n\n"
        f"🎯 *Entry Price*: `{signal['entry_price']:.2f}`\n"
        f"🛡 *Stop Loss*: `{signal['stop_loss']:.2f}`\n"
        f"🚀 *Take Profit*: `{signal['take_profit']:.2f}`\n"
        f"📊 *Risk-to-Reward*: `1:{signal['risk_reward']}`\n"
        f"💼 *Calculated Lot Size*: `{signal['lot_size']:.2f}`\n"
        f"💯 *Confidence Score*: `{signal['confidence_score']}%`\n\n"
        f"🔍 *Confluence Reasons*:\n{reasons_str}\n\n"
        f"🕒 _Timestamp: {signal['timestamp']}_"
    )
    
    # Run in a background thread to prevent blocking the main event loop
    thread = threading.Thread(target=_send_telegram_async, args=(bot_token, chat_id, message))
    thread.daemon = True
    thread.start()

def test_telegram_connection(bot_token: str, chat_id: str) -> bool:
    """Synchronously test the Telegram bot credentials."""
    if not bot_token or not chat_id:
        return False
        
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": "🔌 *Gold Signal Desk*: Telegram Alert Connection Test Successful!",
        "parse_mode": "Markdown"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=5)
        return response.status_code == 200
    except Exception as e:
        print(f"Error testing Telegram connection: {e}")
        return False
