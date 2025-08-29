import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface ConnectedAccount {
  id: string;
  email: string;
  created: number;
  charges_enabled: boolean;
  transfers_enabled: boolean;
  type: string;
}

interface Balance {
  available: any[];
  pending: any[];
  accountId: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [CommonModule, FormsModule]
})
export class AppComponent implements OnInit {
  successMsg = '';
  withdrawMsg = '';
  transferMsg = '';
  onboardingUrl = '';
  onboardingError = '';
  
  // Connected accounts management
  connectedAccounts: ConnectedAccount[] = [];
  selectedAccountId = '';
  
  // Fund transfer
  transferAmount = 0;
  transferDescription = '';
  
  // Payout/Withdrawal
  payoutAmount = 0;
  payoutMethod = 'standard';
  
  // Account balance
  currentBalance: Balance | null = null;
  
  // Form inputs for creating accounts
  newAccountEmail = '';
  newAccountType = 'CLIENT';

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadConnectedAccounts();
  }

  // Load all connected accounts
  loadConnectedAccounts() {
    this.http.get<{ accounts: ConnectedAccount[] }>('http://localhost:4242/connected-accounts')
      .subscribe({
        next: res => {
          this.connectedAccounts = res.accounts;
        },
        error: err => {
          console.error('Failed to load connected accounts:', err);
        }
      });
  }

  // Original deposit function (adds funds to platform)
  deposit() {
    this.http.post<{ url: string }>('http://localhost:4242/create-checkout-session', {})
      .subscribe(res => {
        window.location.href = res.url;
      });
  }

  // **NEW: Transfer funds to a specific connected account**
  transferFunds() {
    if (!this.selectedAccountId || this.transferAmount <= 0) {
      this.transferMsg = 'Please select an account and enter a valid amount.';
      return;
    }

    this.http.post('http://localhost:4242/transfer-funds', {
      amount: this.transferAmount,
      connectedAccountId: this.selectedAccountId,
      description: this.transferDescription || `Transfer of $${this.transferAmount}`
    }).subscribe({
      next: (res: any) => {
        this.transferMsg = `Successfully transferred $${this.transferAmount} to account ${this.selectedAccountId}`;
        this.transferAmount = 0;
        this.transferDescription = '';
        
        // Refresh balance if this account is selected
        if (this.currentBalance?.accountId === this.selectedAccountId) {
          this.getAccountBalance();
        }
      },
      error: err => {
        this.transferMsg = `Transfer failed: ${err.error?.error || 'Unknown error'}`;
      }
    });
  }

  // **NEW: Get account balance**
  getAccountBalance() {
    if (!this.selectedAccountId) {
      return;
    }

    this.http.get<Balance>(`http://localhost:4242/account-balance/${this.selectedAccountId}`)
      .subscribe({
        next: res => {
          this.currentBalance = res;
        },
        error: err => {
          console.error('Failed to get balance:', err);
          this.currentBalance = null;
        }
      });
  }

  // **NEW: Delete a specific connected account**
  deleteAccount(accountId: string) {
    if (!accountId) {
      return;
    }

    // Confirm deletion
    if (!confirm(`Are you sure you want to delete account ${accountId}? This action cannot be undone.`)) {
      return;
    }

    this.http.delete(`http://localhost:4242/delete-account/${accountId}`)
      .subscribe({
        next: (res: any) => {
          // If the deleted account was selected, clear selection
          if (this.selectedAccountId === accountId) {
            this.selectedAccountId = '';
            this.currentBalance = null;
            this.transferMsg = '';
            this.withdrawMsg = '';
          }
          
          // Reload the accounts list
          this.loadConnectedAccounts();
          
          // Show success message (you could add a dedicated property for this)
          this.transferMsg = `Account ${accountId} successfully deleted.`;
          
          // Clear success message after 5 seconds
          setTimeout(() => {
            if (this.transferMsg.includes('successfully deleted')) {
              this.transferMsg = '';
            }
          }, 5000);
        },
        error: err => {
          // Show error message
          this.transferMsg = `Failed to delete account: ${err.error?.error || 'Unknown error'}`;
        }
      });
  }

  // **UPDATED: Proper withdrawal/payout function**
  createPayout() {
    if (!this.selectedAccountId || this.payoutAmount <= 0) {
      this.withdrawMsg = 'Please select an account and enter a valid amount.';
      return;
    }

    this.http.post('http://localhost:4242/create-payout', {
      amount: this.payoutAmount,
      connectedAccountId: this.selectedAccountId,
      method: this.payoutMethod
    }).subscribe({
      next: (res: any) => {
        this.withdrawMsg = `Payout of $${this.payoutAmount} initiated successfully. Status: ${res.payout.status}`;
        this.payoutAmount = 0;
        
        // Refresh balance
        this.getAccountBalance();
      },
      error: err => {
        this.withdrawMsg = `Payout failed: ${err.error?.error || 'Unknown error'}`;
      }
    });
  }

  // Create and onboard new user (existing function)
  createAndOnboardUser() {
    if (!this.newAccountEmail) {
      this.onboardingError = 'Please enter an email address.';
      return;
    }

    this.onboardingUrl = '';
    this.onboardingError = '';
    
    this.http.post<{ accountId: string }>('http://localhost:4242/create-connect-account', { 
      email: this.newAccountEmail, 
      type: this.newAccountType 
    }).subscribe({
      next: res => {
        this.http.post<{ url: string }>('http://localhost:4242/onboard-connect-account', { 
          accountId: res.accountId 
        }).subscribe({
          next: linkRes => {
            this.onboardingUrl = linkRes.url;
            window.open(linkRes.url, '_blank');
            
            // Refresh the accounts list
            setTimeout(() => this.loadConnectedAccounts(), 1000);
            
            // Clear form
            this.newAccountEmail = '';
            this.newAccountType = 'FREELANCER';
          },
          error: err => {
            this.onboardingError = err.error?.error || 'Failed to get onboarding link.';
          }
        });
      },
      error: err => {
        this.onboardingError = err.error?.error || 'Failed to create Connect account.';
      }
    });
  }

  // Utility function to get total available balance
  getTotalAvailableBalance(): number {
    if (!this.currentBalance?.available) return 0;
    return this.currentBalance.available.reduce((sum, bal) => sum + bal.amount, 0) / 100;
  }

  // Utility function to get total pending balance
  getTotalPendingBalance(): number {
    if (!this.currentBalance?.pending) return 0;
    return this.currentBalance.pending.reduce((sum, bal) => sum + bal.amount, 0) / 100;
  }

  // Handle account selection change
  onAccountSelectionChange() {
    this.currentBalance = null;
    this.transferMsg = '';
    this.withdrawMsg = '';
    
    if (this.selectedAccountId) {
      this.getAccountBalance();
    }
  }
}