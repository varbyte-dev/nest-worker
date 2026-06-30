import {
  ApiBody,
  ApiModel,
  ApiOperation,
  ApiResponse,
  ApiTags,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  D1,
  Prop,
  UseMiddleware,
} from "../src/index";
import { bearerAuth } from "../src/index";
import { UsersService } from "./users.service";
import { D1Database } from "../src/core/types";

// ─── Data Models ───────────────────────────────────────────────────

@ApiModel({ description: "User data model" })
class User {
  @Prop() id!: number;
  @Prop({ description: "Full name" }) name!: string;
  @Prop({ description: "Email address" }) email!: string;
  @Prop({ description: "User role", example: "user" }) role!: string;
  @Prop({ description: "Creation timestamp" }) created_at!: string;
}

@ApiModel({ description: "Payload to create a new user" })
class CreateUserDto {
  @Prop({ description: "Full name" }) name!: string;
  @Prop({ description: "Email address", example: "user@example.com" })
  email!: string;
  @Prop({ description: "User role", example: "user" }) role?: string;
}

@ApiModel({ description: "Payload to update an existing user" })
class UpdateUserDto {
  @Prop({ description: "Full name" }) name?: string;
  @Prop({ description: "Email address" }) email?: string;
}

// ─── Controller ────────────────────────────────────────────────────

@ApiTags("Users")
@Controller("users", [UsersService])
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: "List all users",
    description: "Returns a paginated list of users",
  })
  @ApiResponse({ status: 200, description: "List of users" })
  async getAll(@D1() db: D1Database, @Query("limit") limit?: string) {
    const users = await this.usersService.findAll(db);
    const l = limit ? parseInt(limit) : undefined;
    return { data: l ? users.slice(0, l) : users, total: users.length };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get user by ID" })
  @ApiResponse({ status: 200, description: "User found" })
  @ApiResponse({ status: 404, description: "User not found" })
  async getOne(@D1() db: D1Database, @Param("id") id: string) {
    return this.usersService.findById(db, parseInt(id));
  }

  @Post()
  @ApiOperation({ summary: "Create a new user" })
  @ApiResponse({ status: 201, description: "User created" })
  @ApiResponse({ status: 400, description: "Invalid input" })
  @UseMiddleware(bearerAuth({ tokenEnvKey: "API_SECRET" }))
  async create(@D1() db: D1Database, @Body() body: CreateUserDto) {
    return this.usersService.create(db, {
      name: body.name,
      email: body.email,
      role: body.role || "user",
    });
  }

  @Put(":id")
  @ApiOperation({ summary: "Update an existing user" })
  @ApiResponse({ status: 200, description: "User updated" })
  @ApiResponse({ status: 404, description: "User not found" })
  @UseMiddleware(bearerAuth({ tokenEnvKey: "API_SECRET" }))
  async update(
    @D1() db: D1Database,
    @Param("id") id: string,
    @Body() body: UpdateUserDto,
  ) {
    return this.usersService.update(db, parseInt(id), body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a user" })
  @ApiResponse({ status: 200, description: "User deleted" })
  @ApiResponse({ status: 404, description: "User not found" })
  @UseMiddleware(bearerAuth({ tokenEnvKey: "API_SECRET" }))
  async remove(@D1() db: D1Database, @Param("id") id: string) {
    return this.usersService.delete(db, parseInt(id));
  }
}
