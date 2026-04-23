import {
  Controller,
  Get,
  Put,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
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
  async getProfile(@Headers('authorization') auth: string) {
    const userId = await this.getUserId(auth);
    return this.profileService.getProfile(userId);
  }

  @Put()
  async updateProfile(
    @Headers('authorization') auth: string,
    @Body() body: Record<string, unknown>,
  ) {
    const userId = await this.getUserId(auth);
    return this.profileService.updateProfile(userId, body);
  }
}
