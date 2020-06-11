import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RecipeFilterDto } from './recipe-filter.dto';
import { RecipeDto } from './recipe.dto';
import { Recipe } from './recipe.entity';
import { RecipeRepository } from './recipe.repository';

@Injectable()
export class RecipesService {
  constructor(
    @InjectRepository(RecipeRepository)
    private recipeRepository: RecipeRepository,
  ) {}

  async getRecipes(filterDto: RecipeFilterDto): Promise<Recipe[]> {
    return this.recipeRepository.getRecipes(filterDto);
  }

  async getRecipeById(id: number): Promise<Recipe> {
    const recipe = await this.recipeRepository.getRecipe(id);
    return recipe;
  }

  async createRecipe(recipeDto: RecipeDto): Promise<Recipe> {
    const recipe = await this.recipeRepository.createRecipe(recipeDto);
    return recipe;
  }

  async updateRecipe(id: number, recipeDto: RecipeDto): Promise<Recipe> {
    const recipe = await this.recipeRepository.updateRecipe(id, recipeDto);
    return recipe;
  }

  async deleteRecipe(id: number): Promise<void> {
    const recipe = await this.recipeRepository.getRecipe(id);
    await this.recipeRepository.remove(recipe);
  }
}
