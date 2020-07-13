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
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
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

  @UseGuards(AuthGuard('jwt'))
  @Post()
  @UsePipes(ValidationPipe)
  createRecipe(@Body() recipeDto: RecipeDto): Promise<Recipe> {
    return this.recipesService.createRecipe(recipeDto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('/:id')
  deleteRecipe(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.recipesService.deleteRecipe(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('/:id')
  @UsePipes(ValidationPipe)
  updateRecipe(
    @Param('id', ParseIntPipe) id: number,
    @Body() recipeDto: RecipeDto,
  ) {
    return this.recipesService.updateRecipe(id, recipeDto);
  }
}
