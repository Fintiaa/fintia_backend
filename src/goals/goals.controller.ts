import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Headers,
  UnauthorizedException,
  Patch,
} from '@nestjs/common';
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { AddSavingsDto } from './dto/add-savings.dto';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('goals')
export class GoalsController {
  constructor(
    private readonly goalsService: GoalsService,
    private readonly supabase: SupabaseService,
  ) {}

  private async getUserId(authHeader: string): Promise<string> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token requerido');
    }
    const token = authHeader.slice(7);
    const { data, error } = await this.supabase.getClient().auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Token inválido');
    return data.user.id;
  }

  @Get()
  async findAll(@Headers('authorization') auth: string) {
    const userId = await this.getUserId(auth);
    return this.goalsService.findAll(userId);
  }

  @Post()
  async create(
    @Headers('authorization') auth: string,
    @Body() dto: CreateGoalDto,
  ) {
    const userId = await this.getUserId(auth);
    return this.goalsService.create(userId, dto);
  }

  @Patch(':id/savings')
  async addSavings(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() dto: AddSavingsDto,
  ) {
    const userId = await this.getUserId(auth);
    return this.goalsService.addSavings(id, userId, dto);
  }

  @Delete(':id')
  async remove(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
  ) {
    const userId = await this.getUserId(auth);
    return this.goalsService.remove(id, userId);
  }
}