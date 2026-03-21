"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../../../../src/lib/api";
import Link from "next/link";

type Course = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  workloadHours?: number | null;
};

export default function ColaboradorDashboard() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiRequest("/courses", {}, token);
        setCourses(data);
      } catch (err: any) {
        setError(err.message || "Erro ao carregar cursos");
      } finally {
        setLoading(false);
      }
    };
    if (token) load();
  }, [token]);

  const handleEnroll = async (courseId: string) => {
    try {
      await apiRequest(`/enrollments/${courseId}`, { method: "POST" }, token);
      setEnrolled(new Set([...Array.from(enrolled), courseId]));
    } catch (err: any) {
      alert(err.message || "Erro ao inscrever");
    }
  };

  if (!token) {
    return (
      <main className="p-8">
        <p>
          Precisa iniciar sessão.{" "}
          <Link href="/login" className="text-blue-600 underline">
            Ir para login
          </Link>
        </p>
      </main>
    );
  }

  if (loading) return <main className="p-8">A carregar cursos...</main>;
  if (error) return <main className="p-8 text-red-600">{error}</main>;

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Minha formação</h1>

      <section>
        <h2 className="text-lg font-semibold mb-3">Cursos disponíveis</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <div
              key={course.id}
              className="border rounded-xl p-4 flex flex-col justify-between"
            >
              <div>
                <h3 className="font-semibold">{course.title}</h3>
                <p className="text-sm text-slate-600">
                  {course.description}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {course.category} • {course.workloadHours ?? 0}h
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/cursos/${course.id}`}
                  className="px-3 py-1 rounded bg-slate-100 text-xs"
                >
                  Ver curso
                </Link>
                {!enrolled.has(course.id) && (
                  <button
                    onClick={() => handleEnroll(course.id)}
                    className="px-3 py-1 rounded bg-blue-600 text-white text-xs"
                  >
                    Inscrever-me
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
