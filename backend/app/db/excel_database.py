"""
Excel Database Manager
======================
Uses Excel files as a simple database that can be easily edited by users.
Files:
- contacts.xlsx: Phone to UPI mappings
- known_scammers.xlsx: Known fraudulent UPI IDs
- demo_wallets.xlsx: Demo wallet balances
"""
import os
import pandas as pd
from pathlib import Path
from typing import Optional, Dict, List, Any
from datetime import datetime
import hashlib
import secrets
import uuid

# Get the data directory
DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# Excel file paths
CONTACTS_FILE = DATA_DIR / "contacts.xlsx"
SCAMMERS_FILE = DATA_DIR / "known_scammers.xlsx"
WALLETS_FILE = DATA_DIR / "demo_wallets.xlsx"
TRANSACTIONS_FILE = DATA_DIR / "transactions.xlsx"

# Fixed salt for demo UPI PINs (in production, use per-user random salts)
_PIN_SALT = "upi_safeguard_pin_salt_2025"


def _hash_pin(pin: str) -> str:
    """Hash a UPI PIN with a fixed salt using SHA-256"""
    return hashlib.sha256((_PIN_SALT + pin).encode()).hexdigest()


def _verify_pin(pin: str, pin_hash: str) -> bool:
    """Verify a UPI PIN against its hash"""
    return hashlib.sha256((_PIN_SALT + pin).encode()).hexdigest() == pin_hash


def init_excel_databases():
    """Initialize Excel files with sample data if they don't exist"""
    
    # 1. Contacts Database (Phone → UPI mapping)
    if not CONTACTS_FILE.exists() or CONTACTS_FILE.stat().st_size < 100:
        contacts_data = {
            'phone': [
                '9876543210', '9876543211', '9876543212', '9876543213', '9876543214',
                '9876543215', '9876543216', '9876543217', '9876543218', '9876543219',
                '9988776655', '8877665544', '7766554433', '6655443322', '9999888877'
            ],
            'name': [
                'Rahul Sharma', 'Priya Patel', 'Amit Kumar', 'Sneha Gupta', 'Vikram Singh',
                'Anjali Verma', 'Karthik Reddy', 'Meera Nair', 'Suresh Iyer', 'Pooja Mehta',
                'Ravi Krishnan', 'Deepa Joshi', 'Arjun Malhotra', 'Neha Agarwal', 'Sanjay Rao'
            ],
            'upi_id': [
                'rahul.sharma@okaxis', 'priya.patel@ybl', 'amit.kumar@paytm', 'sneha.gupta@icici', 'vikram.singh@sbi',
                'anjali.verma@okaxis', 'karthik.reddy@ybl', 'meera.nair@paytm', 'suresh.iyer@icici', 'pooja.mehta@sbi',
                'ravi.k@okaxis', 'deepa.j@ybl', 'arjun.m@paytm', 'neha.a@icici', 'sanjay.r@sbi'
            ],
            'bank': [
                'Axis Bank', 'Yes Bank', 'Paytm Payments Bank', 'ICICI Bank', 'State Bank of India',
                'Axis Bank', 'Yes Bank', 'Paytm Payments Bank', 'ICICI Bank', 'State Bank of India',
                'Axis Bank', 'Yes Bank', 'Paytm Payments Bank', 'ICICI Bank', 'State Bank of India'
            ],
            'is_verified': [True, True, True, True, True, True, True, True, True, True, True, True, True, True, True],
            'trust_score': [95, 88, 92, 85, 90, 87, 91, 89, 86, 93, 88, 90, 85, 92, 87],
            'account_age_days': [365, 240, 180, 420, 300, 150, 280, 200, 350, 190, 400, 220, 310, 175, 260]
        }
        df = pd.DataFrame(contacts_data)
        df.to_excel(CONTACTS_FILE, index=False, sheet_name='Contacts')
        print(f"✅ Created contacts database: {CONTACTS_FILE}")
    
    # 2. Known Scammers Database
    if not SCAMMERS_FILE.exists() or SCAMMERS_FILE.stat().st_size < 100:
        scammers_data = {
            'upi_id': [
                'lottery.winner@scam', 'kyc.update@fake', 'cbi.officer@fraud', 'customer.care@fake',
                'refund.process@scam', 'olx.seller@fraud', 'amazon.refund@fake', 'paytm.support@scam',
                'bank.verify@phish', 'job.offer@fraud', 'investment.guru@scam', 'crypto.trader@fake'
            ],
            'phone': [
                '9999999901', '9999999902', '9999999903', '9999999904',
                '9999999905', '9999999906', '9999999907', '9999999908',
                '9999999909', '9999999910', '9999999911', '9999999912'
            ],
            'scam_type': [
                'lottery_scam', 'kyc_fraud', 'digital_arrest', 'fake_support',
                'refund_scam', 'marketplace_fraud', 'refund_scam', 'fake_support',
                'phishing', 'job_scam', 'investment_scam', 'crypto_scam'
            ],
            'risk_level': [
                'critical', 'critical', 'critical', 'high',
                'high', 'high', 'critical', 'high',
                'critical', 'high', 'critical', 'high'
            ],
            'report_count': [45, 38, 67, 23, 31, 28, 52, 19, 41, 25, 58, 33],
            'total_amount_stolen': [
                1250000, 890000, 2340000, 450000,
                670000, 520000, 1890000, 380000,
                1120000, 490000, 3200000, 780000
            ],
            'first_reported': [
                '2025-06-15', '2025-08-20', '2025-04-10', '2025-09-05',
                '2025-07-22', '2025-10-18', '2025-05-30', '2025-11-12',
                '2025-03-25', '2025-08-08', '2025-02-14', '2025-07-01'
            ],
            'is_active': [True, True, True, True, True, True, True, True, True, True, True, True]
        }
        df = pd.DataFrame(scammers_data)
        df.to_excel(SCAMMERS_FILE, index=False, sheet_name='Scammers')
        print(f"✅ Created scammers database: {SCAMMERS_FILE}")
    
    # 3. Demo Wallets (for realistic balance)
    if not WALLETS_FILE.exists() or WALLETS_FILE.stat().st_size < 100:
        wallets_data = {
            'user_id': ['demo-user-1', 'demo-user-2', 'demo-user-3'],
            'phone': ['9876543210', '9876543211', '9876543212'],
            'balance': [50000.00, 25000.00, 75000.00],
            'daily_limit': [100000.00, 100000.00, 100000.00],
            'spent_today': [0.00, 0.00, 0.00],
            'upi_pin_hash': [_hash_pin('1234'), _hash_pin('5678'), _hash_pin('9012')],
            'last_transaction': ['', '', '']
        }
        df = pd.DataFrame(wallets_data)
        df.to_excel(WALLETS_FILE, index=False, sheet_name='Wallets')
        print(f"✅ Created wallets database: {WALLETS_FILE}")
    
    # 4. Transactions Log
    if not TRANSACTIONS_FILE.exists() or TRANSACTIONS_FILE.stat().st_size < 100:
        transactions_data = {
            'txn_id': [],
            'timestamp': [],
            'sender_phone': [],
            'sender_upi': [],
            'recipient_upi': [],
            'recipient_name': [],
            'amount': [],
            'status': [],
            'risk_score': [],
            'risk_level': [],
            'ml_scores': [],
            'blocked_reason': []
        }
        df = pd.DataFrame(transactions_data)
        df.to_excel(TRANSACTIONS_FILE, index=False, sheet_name='Transactions')
        print(f"✅ Created transactions log: {TRANSACTIONS_FILE}")


class ExcelDatabase:
    """Excel-based database manager"""
    
    @staticmethod
    def get_contact_by_phone(phone: str) -> Optional[Dict]:
        """Look up contact by phone number"""
        phone = phone.replace('+91', '').replace(' ', '').strip()
        try:
            df = pd.read_excel(CONTACTS_FILE)
            match = df[df['phone'].astype(str) == phone]
            if not match.empty:
                row = match.iloc[0]
                return {
                    'phone': str(row['phone']),
                    'name': row['name'],
                    'upi_id': row['upi_id'],
                    'bank': row['bank'],
                    'is_verified': bool(row['is_verified']),
                    'trust_score': float(row['trust_score']),
                    'account_age_days': int(row['account_age_days'])
                }
        except Exception as e:
            print(f"Error reading contacts: {e}")
        return None
    
    @staticmethod
    def get_contact_by_upi(upi_id: str) -> Optional[Dict]:
        """Look up contact by UPI ID"""
        try:
            df = pd.read_excel(CONTACTS_FILE)
            match = df[df['upi_id'].str.lower() == upi_id.lower()]
            if not match.empty:
                row = match.iloc[0]
                return {
                    'phone': str(row['phone']),
                    'name': row['name'],
                    'upi_id': row['upi_id'],
                    'bank': row['bank'],
                    'is_verified': bool(row['is_verified']),
                    'trust_score': float(row['trust_score']),
                    'account_age_days': int(row['account_age_days'])
                }
        except Exception as e:
            print(f"Error reading contacts: {e}")
        return None
    
    @staticmethod
    def check_scammer(upi_id: str) -> Optional[Dict]:
        """Check if UPI ID is in scammer database"""
        try:
            df = pd.read_excel(SCAMMERS_FILE)
            match = df[df['upi_id'].str.lower() == upi_id.lower()]
            if not match.empty:
                row = match.iloc[0]
                return {
                    'upi_id': row['upi_id'],
                    'phone': str(row['phone']),
                    'scam_type': row['scam_type'],
                    'risk_level': row['risk_level'],
                    'report_count': int(row['report_count']),
                    'total_amount_stolen': float(row['total_amount_stolen']),
                    'is_active': bool(row['is_active'])
                }
        except Exception as e:
            print(f"Error reading scammers: {e}")
        return None
    
    @staticmethod
    def check_scammer_by_phone(phone: str) -> Optional[Dict]:
        """Check if phone is in scammer database"""
        phone = phone.replace('+91', '').replace(' ', '').strip()
        try:
            df = pd.read_excel(SCAMMERS_FILE)
            match = df[df['phone'].astype(str) == phone]
            if not match.empty:
                row = match.iloc[0]
                return {
                    'upi_id': row['upi_id'],
                    'phone': str(row['phone']),
                    'scam_type': row['scam_type'],
                    'risk_level': row['risk_level'],
                    'report_count': int(row['report_count']),
                    'total_amount_stolen': float(row['total_amount_stolen']),
                    'is_active': bool(row['is_active'])
                }
        except Exception as e:
            print(f"Error reading scammers: {e}")
        return None
    
    @staticmethod
    def get_wallet(phone: str) -> Optional[Dict]:
        """Get wallet balance for user"""
        phone = phone.replace('+91', '').replace(' ', '').strip()
        try:
            df = pd.read_excel(WALLETS_FILE)
            match = df[df['phone'].astype(str) == phone]
            if not match.empty:
                row = match.iloc[0]
                return {
                    'user_id': row['user_id'],
                    'phone': str(row['phone']),
                    'balance': float(row['balance']),
                    'daily_limit': float(row['daily_limit']),
                    'spent_today': float(row['spent_today']),
                    'upi_pin_hash': str(row['upi_pin_hash'])
                }
        except Exception as e:
            print(f"Error reading wallets: {e}")
        return None
    
    @staticmethod
    def update_wallet_balance(phone: str, new_balance: float, spent: float) -> bool:
        """Update wallet balance after transaction"""
        phone = phone.replace('+91', '').replace(' ', '').strip()
        try:
            df = pd.read_excel(WALLETS_FILE)
            idx = df[df['phone'].astype(str) == phone].index
            if not idx.empty:
                df.loc[idx[0], 'balance'] = new_balance
                df.loc[idx[0], 'spent_today'] = spent
                df.loc[idx[0], 'last_transaction'] = datetime.now().isoformat()
                df.to_excel(WALLETS_FILE, index=False, sheet_name='Wallets')
                return True
        except Exception as e:
            print(f"Error updating wallet: {e}")
        return False

    @staticmethod
    def verify_upi_pin(phone: str, pin: str) -> bool:
        """Verify UPI PIN against hash stored in wallet"""
        wallet = ExcelDatabase.get_wallet(phone)
        if not wallet or not wallet.get('upi_pin_hash'):
            return False
        return _verify_pin(pin, wallet['upi_pin_hash'])
    
    @staticmethod
    def log_transaction(txn_data: Dict) -> bool:
        """Log transaction to Excel"""
        try:
            df = pd.read_excel(TRANSACTIONS_FILE)
            new_row = pd.DataFrame([txn_data])
            df = pd.concat([df, new_row], ignore_index=True)
            df.to_excel(TRANSACTIONS_FILE, index=False, sheet_name='Transactions')
            return True
        except Exception as e:
            print(f"Error logging transaction: {e}")
        return False
    
    @staticmethod
    def get_all_scammers() -> List[Dict]:
        """Get all known scammers"""
        try:
            df = pd.read_excel(SCAMMERS_FILE)
            return df.to_dict('records')
        except Exception as e:
            print(f"Error reading scammers: {e}")
        return []
    
    @staticmethod
    def get_all_contacts() -> List[Dict]:
        """Get all contacts"""
        try:
            df = pd.read_excel(CONTACTS_FILE)
            return df.to_dict('records')
        except Exception as e:
            print(f"Error reading contacts: {e}")
        return []
    
    @staticmethod
    def get_recent_transactions(limit: int = 50) -> List[Dict]:
        """Get recent transactions"""
        try:
            df = pd.read_excel(TRANSACTIONS_FILE)
            return df.tail(limit).to_dict('records')
        except Exception as e:
            print(f"Error reading transactions: {e}")
        return []
    
    @staticmethod
    def add_contact(phone: str, name: str, upi_id: str, bank: str = 'UPI SafeGuard',
                   is_verified: bool = True, trust_score: float = 70.0, account_age_days: int = 0) -> bool:
        """Add a new registered user to the contacts database so they are searchable"""
        try:
            df = pd.read_excel(CONTACTS_FILE)
            # Check if this phone or UPI already exists
            phone_clean = phone.replace('+91', '').replace(' ', '').strip()
            if not df[df['phone'].astype(str) == phone_clean].empty:
                # Update existing entry
                idx = df[df['phone'].astype(str) == phone_clean].index[0]
                df.loc[idx, 'name'] = name
                df.loc[idx, 'upi_id'] = upi_id
                df.loc[idx, 'bank'] = bank
                df.loc[idx, 'is_verified'] = is_verified
                df.loc[idx, 'trust_score'] = trust_score
                df.to_excel(CONTACTS_FILE, index=False, sheet_name='Contacts')
                return True
            if not df[df['upi_id'].str.lower() == upi_id.lower()].empty:
                # UPI already exists, update name
                idx = df[df['upi_id'].str.lower() == upi_id.lower()].index[0]
                df.loc[idx, 'name'] = name
                df.loc[idx, 'phone'] = phone_clean
                df.loc[idx, 'bank'] = bank
                df.to_excel(CONTACTS_FILE, index=False, sheet_name='Contacts')
                return True
            # Add new entry
            new_row = {
                'phone': phone_clean,
                'name': name,
                'upi_id': upi_id,
                'bank': bank,
                'is_verified': is_verified,
                'trust_score': trust_score,
                'account_age_days': account_age_days
            }
            df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
            df.to_excel(CONTACTS_FILE, index=False, sheet_name='Contacts')
            return True
        except Exception as e:
            print(f"Error adding contact: {e}")
        return False

    @staticmethod
    def add_scammer(upi_id: str, phone: str, scam_type: str, risk_level: str = 'high') -> bool:
        """Add new scammer to database"""
        try:
            df = pd.read_excel(SCAMMERS_FILE)
            new_row = {
                'upi_id': upi_id,
                'phone': phone,
                'scam_type': scam_type,
                'risk_level': risk_level,
                'report_count': 1,
                'total_amount_stolen': 0,
                'first_reported': datetime.now().strftime('%Y-%m-%d'),
                'is_active': True
            }
            df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
            df.to_excel(SCAMMERS_FILE, index=False, sheet_name='Scammers')
            return True
        except Exception as e:
            print(f"Error adding scammer: {e}")
        return False


# Initialize databases on import
init_excel_databases()
