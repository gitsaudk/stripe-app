import { Routes } from '@angular/router';
import { ReturnComponent } from './return/return.component';
import { SuccessComponent } from './status/success.component';
import { CancelComponent } from './status/cancel.component';

export const routes: Routes = [
  // ...other routes...
  { path: 'return', component: ReturnComponent },
  { path: 'reauth', component: ReturnComponent }, // Optional, for refresh_url
  { path: 'success', component: SuccessComponent },
  { path: 'cancel', component: CancelComponent },
];
