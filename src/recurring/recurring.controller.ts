import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { RecurringService } from './recurring.service';
import { CreateRecurringDto } from './dto/create-recurring.dto';
import { UpdateRecurringDto } from './dto/update-recurring.dto';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('recurring')
export class RecurringController {
  constructor(
    private readonly recurringService: RecurringService,
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
    return this.recurringService.findAll(userId);
  }

  @Post()
  async create(
    @Headers('authorization') auth: string,
    @Body() dto: CreateRecurringDto,
  ) {
    const userId = await this.getUserId(auth);
    return this.recurringService.create(userId, dto);
  }

  @Put(':id')
  async update(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() dto: UpdateRecurringDto,
  ) {
    const userId = await this.getUserId(auth);
    return this.recurringService.update(id, userId, dto);
  }

  @Delete(':id')
  async remove(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
  ) {
    const userId = await this.getUserId(auth);
    return this.recurringService.remove(id, userId);
  }
}
