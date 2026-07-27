import { ApiProperty } from '@nestjs/swagger';
import { IsAllowedFileUrl } from '../../common/validators/is-allowed-file-url.validator';

export class SubmitFunderReportDto {
  @ApiProperty({ example: 'https://storage.innova.ao/reports/q2-2026.pdf' })
  @IsAllowedFileUrl()
  fileUrl!: string;
}
