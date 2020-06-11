import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RecipeFilterDto } from './recipe-filter.dto';
import { RecipeDto } from './recipe.dto';
import { Recipe } from './recipe.entity';
import { RecipesService } from './recipes.service';

@Controller('recipes')
export class RecipesController {
  constructor(private recipesService: RecipesService) {}

  @Get()
  getRecipes(
    @Query(ValidationPipe) filterDto: RecipeFilterDto,
  ): Promise<Recipe[]> {
    return this.recipesService.getRecipes(filterDto);
  }

  @Get('/:id')
  getRecipeById(@Param('id', ParseIntPipe) id: number): Promise<Recipe> {
    return this.recipesService.getRecipeById(id);
  }

  @Post()
  @UsePipes(ValidationPipe)
  createRecipe(@Body() recipeDto: RecipeDto): Promise<Recipe> {
    return this.recipesService.createRecipe(recipeDto);
  }

  @Delete('/:id')
  deleteRecipe(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.recipesService.deleteRecipe(id);
  }

  @Put('/:id')
  @UsePipes(ValidationPipe)
  updateRecipe(
    @Param('id', ParseIntPipe) id: number,
    @Body() recipeDto: RecipeDto,
  ) {
    return this.recipesService.updateRecipe(id, recipeDto);
  }
}
