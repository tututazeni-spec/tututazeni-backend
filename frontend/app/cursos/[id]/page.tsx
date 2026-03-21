"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";
import { useParams } from "next/navigation";

type Lesson = {
  id: string;
  title: string;
  contentType: string;
  moduleId: string;
};

type ModuleType = {
  id: string;
  title: string;
};

type CourseWithModules = {
  id: string;
  title: string;
  description?: string;
  modules: { id: string; title: string; lessons: Lesson[] }[];
};

export default function CoursePage() {
  const params = useParams();
  const id = params?.id as string;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";

  const [course, setCourse] = useState<CourseWithModules | null>(null);
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const c = await apiRequest(`/courses/${id}`, {}, token);
        setCourse(c);

        // Aqui você poderia buscar a enrollment do user para esse curso
        // Por simplicidade, imagine que você guarda enrollmentId em algum lugar
      } catch (err: any) {
        setError(err.message || "Erro ao carregar curso");
      } finally {
        setLoading(false);
      }
    };
    if (token && id) load();
  }, [token, id]);

  const handleCompleteLesson = async (lessonId: string) => {
    if (!enrollmentId) {
      alert("EnrollmentId não definido (precisa implementar busca).");
      return;
    }
    try {
      await apiRequest(
        `/enrollments/${enrollmentId}/lessons/${lessonId}/complete`,
        { method: "PATCH" },
        token
      );
      alert("Aula marcada como concluída!");
    } catch (err: any) {
      alert(err.message || "Erro ao marcar aula");
    }
  };

  if (loading) return <main className="p-8">A carregar curso...</main>;
  if (error) return <main className="p-8 text-red-600">{error}</main>;
  if (!course) return <main className="p-8">Curso não encontrado</main>;

  return (
    <main className="p-8 space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{course.title}</h1>
        <p className="text-sm text-slate-600">{course.description}</p>
      </header>

      <section className="space-y-4">
        {course.modules.map((mod) => (
          <div key={mod.id} className="border rounded-xl p-4">
            <h2 className="font-semibold mb-2">{mod.title}</h2>
            <ul className="space-y-2">
              {mod.lessons.map((lesson) => (
                <li
                  key={lesson.id}
                  className="flex justify-between items-center"
                >
                  <div>
                    <p className="text-sm font-medium">{lesson.title}</p>
                    <p className="text-xs text-slate-500">
                      Tipo: {lesson.contentType}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCompleteLesson(lesson.id)}
                    className="px-3 py-1 rounded bg-slate-100 text-xs"
                  >
                    Marcar concluída
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
