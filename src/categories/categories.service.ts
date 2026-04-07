import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const MAX_CUSTOM_CATEGORIES = 20;

@Injectable()
export class CategoriesService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(userId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('categories')
      .select('*')
      .or(`user_id.eq.${userId},is_default.eq.true`)
      .order('is_default', { ascending: false })
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async create(userId: string, dto: CreateCategoryDto) {
    // Check custom category limit
    const { count } = await this.supabase
      .getClient()
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_default', false);

    if ((count ?? 0) >= MAX_CUSTOM_CATEGORIES) {
      throw new BadRequestException(`Límite de ${MAX_CUSTOM_CATEGORIES} categorías personalizadas alcanzado`);
    }

    // Check for duplicate name
    const { data: existing } = await this.supabase
      .getClient()
      .from('categories')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', dto.name)
      .maybeSingle();

    if (existing) throw new BadRequestException('Ya existe una categoría con ese nombre');

    const { data, error } = await this.supabase
      .getClient()
      .from('categories')
      .insert({ ...dto, user_id: userId, is_default: false })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, userId: string, dto: UpdateCategoryDto) {
    const category = await this.findOne(id, userId);

    if (category.is_default) {
      throw new BadRequestException('No se pueden editar categorías predeterminadas');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('categories')
      .update(dto)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async remove(id: string, userId: string) {
    const category = await this.findOne(id, userId);

    if (category.is_default) {
      throw new BadRequestException('No se pueden eliminar categorías predeterminadas');
    }

    const { error } = await this.supabase
      .getClient()
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    return { message: 'Categoría eliminada' };
  }

  private async findOne(id: string, userId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Categoría no encontrada');
    return data;
  }
}