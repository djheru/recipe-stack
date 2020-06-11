import {
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EntityRepository, Repository } from 'typeorm';
import { RecipeFilterDto } from './recipe-filter.dto';
import { RecipeDto } from './recipe.dto';
import { Recipe } from './recipe.entity';

@EntityRepository(Recipe)
export class RecipeRepository extends Repository<Recipe> {
  private log = new Logger('recipe-repository');

  private setFromDto(recipeDto: RecipeDto, recipeEntity: Recipe): Recipe {
    const {
      userId,
      title,
      description,
      servings = null,
      ingredients,
      instructions,
      images = [],
    } = recipeDto;
    recipeEntity.userId = userId;
    recipeEntity.title = title;
    recipeEntity.description = description;
    recipeEntity.servings = servings;
    recipeEntity.ingredients = ingredients;
    recipeEntity.instructions = instructions;
    recipeEntity.images = images;
    return recipeEntity;
  }

  async createRecipe(recipeDto: RecipeDto): Promise<Recipe> {
    try {
      const recipe = new Recipe();
      this.setFromDto(recipeDto, recipe);
      await recipe.save();
      return recipe;
    } catch (e) {
      const message = 'Error creating recipe';
      this.log.error(
        `${message}: ${JSON.stringify(recipeDto)} - ${e.stack || e.message}`,
      );
      throw new InternalServerErrorException(message);
    }
  }

  async getRecipe(id: number): Promise<Recipe> {
    try {
      const recipe = await this.findOne({ where: { id } });
      if (!recipe) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }
      return recipe;
    } catch (e) {
      const message = 'Error retrieving recipe';
      this.log.error(`${message}: ${id} - ${e.stack || e.message}`);
      throw new InternalServerErrorException(message);
    }
  }

  async getRecipes(filterDto: RecipeFilterDto): Promise<Recipe[]> {
    try {
      const { searchTerm, userId } = filterDto;
      const query = this.createQueryBuilder('recipe');

      if (userId) {
        query.where('recipe.userId = :userId', { userId });
      }

      if (searchTerm) {
        query.where(
          'recipe.title ILIKE :searchTerm OR recipe.description ILIKE :searchTerm',
          { searchTerm },
        );
      }

      const recipes = await query.getMany();
      return recipes;
    } catch (e) {
      const message = 'Error retrieving recipes';
      this.log.error(
        `${message}: ${JSON.stringify(filterDto)} - ${e.stack || e.message}`,
      );
      throw new InternalServerErrorException(message);
    }
  }

  async updateRecipe(id: number, recipeDto: RecipeDto): Promise<Recipe> {
    try {
      const recipe = await this.getRecipe(id);
      this.setFromDto(recipeDto, recipe);
      await recipe.save();
      return recipe;
    } catch (e) {
      const message = 'Error updating recipe';
      this.log.error(
        `${message}: ${id} ${JSON.stringify(recipeDto)} - ${e.stack ||
          e.message}`,
      );
      throw new InternalServerErrorException(message);
    }
  }
}
