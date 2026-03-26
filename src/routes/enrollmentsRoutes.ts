import { Router, Request, Response } from "express";
import {
  getEnrollments,
  getEnrollmentById,
  createEnrollment,
  updateEnrollment,
  deleteEnrollment,
} from "../services/enrollmentService";

const router = Router();

router.get("/", (_req: Request, res: Response): void => {
  res.json({ message: "Enrollments funcionando 🚀" });
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const enrollmentId = Number(req.params.id);

  if (isNaN(enrollmentId)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const enrollment = await getEnrollmentById(enrollmentId);

  if (!enrollment) {
    res.status(404).json({ error: "Enrollment não encontrado" });
    return;
  }

  res.json(enrollment);
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, courseId, status } = req.body;

    const enrollment = await createEnrollment(
      Number(userId),
      Number(courseId),
      status
    );

    res.status(201).json(enrollment);
  } catch (error) {
    res.status(500).json({ error: "Erro ao criar enrollment" });
  }
});

router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  const enrollmentId = Number(req.params.id);

  if (isNaN(enrollmentId)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  try {
    const enrollment = await updateEnrollment(enrollmentId, req.body);
    res.json(enrollment);
  } catch (error) {
    res.status(500).json({ error: "Erro ao actualizar enrollment" });
  }
});

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const enrollmentId = Number(req.params.id);

  if (isNaN(enrollmentId)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  try {
    await deleteEnrollment(enrollmentId);
    res.json({ message: "Enrollment eliminado com sucesso" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao eliminar enrollment" });
  }
});

export default router;