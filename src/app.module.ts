import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesModule } from './categories/categories.module';
import { BudgetsModule } from './budgets/budgets.module';
import { GoalsModule } from './goals/goals.module';
import { RecurringModule } from './recurring/recurring.module';
import { AlertsModule } from './alerts/alerts.module';
import { ProfileModule } from './profile/profile.module';
import { GmailModule } from './gmail/gmail.module';
import { RemindersModule } from './reminders/reminders.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    TransactionsModule,
    CategoriesModule,
    BudgetsModule,
    GoalsModule,
    RecurringModule,
    AlertsModule,
    ProfileModule,
    GmailModule,
    RemindersModule,
    AiModule,
  ],
})
export class AppModule {}