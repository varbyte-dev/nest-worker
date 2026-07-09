import { Injectable } from '../src/index';
import { D1Repository } from '../src/index';
import { D1Database } from '../src/core/types';
import { NotFoundException } from '../src/index';

export type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
};

@Injectable()
export class UsersService {

  private getRepo(db: D1Database): D1Repository<User> {
    return new D1Repository<User>(db, 'users');
  }

  async findAll(db: D1Database): Promise<User[]> {
    return this.getRepo(db).findAll();
  }

  async findById(db: D1Database, id: number): Promise<User> {
    const user = await this.getRepo(db).findById(id);
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  async create(db: D1Database, data: Omit<User, 'id' | 'created_at'>): Promise<{ id: number; message: string }> {
    const user = await this.getRepo(db).create(data as any);
    return { id: user.id, message: 'User created' };
  }

  async update(db: D1Database, id: number, data: Partial<Omit<User, 'id' | 'created_at'>>): Promise<User> {
    const updated = await this.getRepo(db).update(id, data);
    if (!updated) throw new NotFoundException(`User #${id} not found`);
    return updated;
  }

  async delete(db: D1Database, id: number): Promise<{ message: string }> {
    await this.findById(db, id);
    await this.getRepo(db).delete(id);
    return { message: `User #${id} deleted` };
  }
}
