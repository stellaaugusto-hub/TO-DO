// Icônes disponibles pour les quêtes (cliquables pour changer).
import {
  Sword, Shield, Crown, Gem, Trophy, Target, Flag, Rocket, Zap, Flame, Star, Sparkles, Heart, Megaphone, Mail, Phone,
  MessageCircle, Users, User, Briefcase, Presentation, ChartColumn, Receipt, Wallet, ShoppingBag, Package, Truck, Globe,
  Code, Bug, Wrench, Palette, PenLine, Image, Camera, Video, Music, Mic, BookOpen, GraduationCap, Lightbulb, Coffee,
  Dumbbell, Plane, Car, House, Calendar, Clock, CircleCheck, FileText, Folder, Lock, Leaf, Sun, Moon, Gift, Brain, Puzzle,
  Mountain, Medal,
} from 'lucide-react';

export const ICONS = {
  sword: Sword, shield: Shield, crown: Crown, gem: Gem, trophy: Trophy, target: Target, flag: Flag, rocket: Rocket,
  zap: Zap, flame: Flame, star: Star, sparkles: Sparkles, heart: Heart, medal: Medal, mountain: Mountain, puzzle: Puzzle,
  megaphone: Megaphone, mail: Mail, phone: Phone, message: MessageCircle, users: Users, user: User, briefcase: Briefcase,
  presentation: Presentation, chart: ChartColumn, receipt: Receipt, wallet: Wallet, shopping: ShoppingBag, package: Package,
  truck: Truck, globe: Globe, code: Code, bug: Bug, wrench: Wrench, palette: Palette, pen: PenLine, image: Image,
  camera: Camera, video: Video, music: Music, mic: Mic, book: BookOpen, graduation: GraduationCap, lightbulb: Lightbulb,
  brain: Brain, coffee: Coffee, dumbbell: Dumbbell, plane: Plane, car: Car, home: House, calendar: Calendar, clock: Clock,
  check: CircleCheck, file: FileText, folder: Folder, lock: Lock, leaf: Leaf, sun: Sun, moon: Moon, gift: Gift,
};

export function iconFor(key) {
  return ICONS[key] || Sword;
}
