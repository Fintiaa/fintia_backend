import { Module } from '@nestjs/common';
import { SupabaseModule } from './supabase/supabase.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesModule } from './categories/categories.module';
import { BudgetsModule } from './budgets/budgets.module';
import { GoalsModule } from './goals/goals.module';

@Module({
  imports: [
    SupabaseModule,
    TransactionsModule,
    CategoriesModule,
    BudgetsModule,
    GoalsModule,
  ],
})
export class AppModule {}