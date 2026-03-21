import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  D1,
  UseMiddleware,
} from '../src/index';
import { bearerAuth } from '../src/index';
import { UsersService } from './users.service';
import { D1Database } from '../src/core/types';

@Controller('users', [UsersService])
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async getAll(
    @D1() db: D1Database,
    @Query('limit') limit?: string
  ) {
    const users = await this.usersService.findAll(db);
    const l = limit ? parseInt(limit) : undefined;
    return { data: l ? users.slice(0, l) : users, total: users.length };
  }

  @Get(':id')
  async getOne(
    @D1() db: D1Database,
    @Param('id') id: string
  ) {
    return this.usersService.findById(db, parseInt(id));
  }

  @Post()
  @UseMiddleware(bearerAuth({ tokenEnvKey: 'API_SECRET' }))
  async create(
    @D1() db: D1Database,
    @Body() body: { name: string; email: string; role?: string }
  ) {
    return this.usersService.create(db, {
      name: body.name,
      email: body.email,
      role: body.role || 'user',
    });
  }

  @Put(':id')
  @UseMiddleware(bearerAuth({ tokenEnvKey: 'API_SECRET' }))
  async update(
    @D1() db: D1Database,
    @Param('id') id: string,
    @Body() body: { name?: string; email?: string; role?: string }
  ) {
    return this.usersService.update(db, parseInt(id), body);
  }

  @Delete(':id')
  @UseMiddleware(bearerAuth({ tokenEnvKey: 'API_SECRET' }))
  async remove(
    @D1() db: D1Database,
    @Param('id') id: string
  ) {
    return this.usersService.delete(db, parseInt(id));
  }
}
