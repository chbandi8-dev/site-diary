import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ProjectForm from "@/components/admin/ProjectForm";

interface Props { params: { id: string } }

export default async function EditProjectPage({ params }: Props) {
  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) notFound();
  return <ProjectForm project={project} />;
}
