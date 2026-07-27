import { Test, TestingModule } from '@nestjs/testing';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  createCollection: jest.fn().mockResolvedValue({ id: 1 }),
  findAllCollections: jest.fn().mockResolvedValue([]),
  getDashboard: jest.fn().mockResolvedValue({}),
  createItem: jest.fn().mockResolvedValue({ id: 1 }),
  findAllItems: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  findItemById: jest.fn().mockResolvedValue({ id: 1 }),
  updateItem: jest.fn().mockResolvedValue({ id: 1 }),
  softDeleteItem: jest.fn().mockResolvedValue({}),
  approveItem: jest.fn().mockResolvedValue({ id: 1 }),
  view: jest.fn().mockResolvedValue({}),
  download: jest.fn().mockResolvedValue({ url: 'x' }),
  rateItem: jest.fn().mockResolvedValue({}),
  addComment: jest.fn().mockResolvedValue({ id: 1 }),
  deleteComment: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('LibraryController', () => {
  let controller: LibraryController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LibraryController],
      providers: [{ provide: LibraryService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<LibraryController>(LibraryController);
  });

  it('createCollection → createCollection(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createCollection(dto, mockUser as any);
    expect(mockSvc.createCollection).toHaveBeenCalledWith(dto, 1);
  });

  it('findAllCollections → findAllCollections()', async () => {
    await controller.findAllCollections();
    expect(mockSvc.findAllCollections).toHaveBeenCalled();
  });

  it('getDashboard → getDashboard()', async () => {
    await controller.getDashboard();
    expect(mockSvc.getDashboard).toHaveBeenCalled();
  });

  it('createItem → createItem(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createItem(dto, mockUser as any);
    expect(mockSvc.createItem).toHaveBeenCalledWith(dto, 1);
  });

  it('findAllItems → findAllItems(filters)', async () => {
    const filters = {} as any;
    await controller.findAllItems(filters);
    expect(mockSvc.findAllItems).toHaveBeenCalledWith(filters);
  });

  it('findItemById → findItemById(id)', async () => {
    await controller.findItemById('i1');
    expect(mockSvc.findItemById).toHaveBeenCalledWith('i1');
  });

  it('updateItem → updateItem(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.updateItem('i1', dto, mockUser as any);
    expect(mockSvc.updateItem).toHaveBeenCalledWith('i1', dto, 1);
  });

  it('removeItem → softDeleteItem(id, userId)', async () => {
    await controller.removeItem('i1', mockUser as any);
    expect(mockSvc.softDeleteItem).toHaveBeenCalledWith('i1', 1);
  });

  it('approveItem → approveItem(id, userId)', async () => {
    await controller.approveItem('i1', mockUser as any);
    expect(mockSvc.approveItem).toHaveBeenCalledWith('i1', 1);
  });

  it('view → view(id, userId)', async () => {
    await controller.view('i1', mockUser as any);
    expect(mockSvc.view).toHaveBeenCalledWith('i1', 1);
  });

  it('download → download(id, userId)', async () => {
    await controller.download('i1', mockUser as any);
    expect(mockSvc.download).toHaveBeenCalledWith('i1', 1);
  });

  it('rateItem → rateItem(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.rateItem('i1', dto, mockUser as any);
    expect(mockSvc.rateItem).toHaveBeenCalledWith('i1', dto, 1);
  });

  it('addComment → addComment(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.addComment('i1', dto, mockUser as any);
    expect(mockSvc.addComment).toHaveBeenCalledWith('i1', dto, 1);
  });

  it('deleteComment → deleteComment(commentId, user)', async () => {
    await controller.deleteComment('c1', mockUser as any);
    expect(mockSvc.deleteComment).toHaveBeenCalledWith('c1', mockUser);
  });
});
