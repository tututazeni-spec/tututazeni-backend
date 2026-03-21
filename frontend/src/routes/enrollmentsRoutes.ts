import { Router } from "express";
import {
  getEnrollments,
  getEnrollmentById,
  createEnrollment,
  updateEnrollment,
  deleteEnrollment
} from "../services/enrollmentService";

const router = Router();

router.get("/", (req, res) => {
  res.json({ message: "Enrollments funcionando 🚀" });
});

router.get("/:id", async (req, res) => {
  const enrollmentId = Number(req.params.id); // converte string para number
  const enrollment = await getEnrollmentById(enrollmentId);
  res.json(enrollment);
});

router.post("/", async (req, res) => {
  try {
    const { userId, courseId, status } = req.body;

    const enrollment = await createEnrollment(
      Number(userId),
      Number(courseId),
      status
    );

    res.json(enrollment);
  } catch (error) {
    res.status(500).json({ error: "Erro ao criar enrollment" });
  }
});

router.put("/:id", async (req, res) => {
  const enrollmentId = Number(req.params.id); // converte string → number

if (isNaN(enrollmentId)) {
  return res.status(400).json({ error: "ID inválido" });
}

const enrollment = await updateEnrollment(enrollmentId, req.body);
  res.json(enrollment);
});

router.delete("/:id", async (req, res) => {
  const enrollmentId = Number(req.params.id); // converte string para number
if (isNaN(enrollmentId)) {
  return res.status(400).json({ error: "ID inválido" });
}

await deleteEnrollment(enrollmentId);
  res.json({ message: "Enrollment deletado" });
});

export default router;
