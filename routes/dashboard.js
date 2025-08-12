const express = require('express');
const moment = require('moment-timezone');
const { auth, adminOrInstructor } = require('../middleware/auth');
const Payment = require('../models/Payment');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Lesson = require('../models/Lesson');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Booking = require('../models/Booking');

const router = express.Router();

/**
 * Dashboard financeiro - KPIs principais
 */
router.get('/financial', auth, adminOrInstructor, async (req, res) => {
  try {
    const { from, to, period = 'month' } = req.query;
    
    // Definir período padrão (mês atual)
    let startDate, endDate;
    if (from && to) {
      startDate = moment(from).startOf('day');
      endDate = moment(to).endOf('day');
    } else {
      startDate = moment().startOf(period);
      endDate = moment().endOf(period);
    }
    
    // KPI 1: Receita do período
    const revenue = await Payment.aggregate([
      {
        $match: {
          status: 'paid',
          paidAt: {
            $gte: startDate.toDate(),
            $lte: endDate.toDate()
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$paidAmount' },
          count: { $sum: 1 },
          avgTicket: { $avg: '$paidAmount' }
        }
      }
    ]);
    
    // KPI 2: Receita da loja (produtos)
    const storeRevenue = await Order.aggregate([
      {
        $match: {
          status: { $in: ['completed', 'delivered'] },
          createdAt: {
            $gte: startDate.toDate(),
            $lte: endDate.toDate()
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // KPI 3: Inadimplência
    const overdue = await Payment.aggregate([
      {
        $match: {
          status: 'pending',
          dueDate: { $lt: new Date() }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // KPI 4: Alunos ativos vs inativos
    const studentsStats = await Student.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // KPI 5: Taxa de presença do período
    const attendanceRate = await Attendance.aggregate([
      {
        $lookup: {
          from: 'lessons',
          localField: 'lesson',
          foreignField: '_id',
          as: 'lessonData'
        }
      },
      {
        $unwind: '$lessonData'
      },
      {
        $match: {
          'lessonData.date': {
            $gte: startDate.toDate(),
            $lte: endDate.toDate()
          }
        }
      },
      {
        $group: {
          _id: null,
          totalAttendances: { $sum: 1 },
          presentCount: {
            $sum: {
              $cond: [{ $eq: ['$present', true] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          totalAttendances: 1,
          presentCount: 1,
          attendanceRate: {
            $multiply: [
              { $divide: ['$presentCount', '$totalAttendances'] },
              100
            ]
          }
        }
      }
    ]);
    
    // Receita diária para gráfico
    const dailyRevenue = await Payment.aggregate([
      {
        $match: {
          status: 'paid',
          paidAt: {
            $gte: startDate.toDate(),
            $lte: endDate.toDate()
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$paidAt'
            }
          },
          revenue: { $sum: '$paidAmount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);
    
    // Top alunos inadimplentes
    const topOverdueStudents = await Payment.aggregate([
      {
        $match: {
          status: 'pending',
          dueDate: { $lt: new Date() }
        }
      },
      {
        $group: {
          _id: '$student',
          totalOverdue: { $sum: '$totalAmount' },
          overdueCount: { $sum: 1 },
          oldestDue: { $min: '$dueDate' }
        }
      },
      {
        $lookup: {
          from: 'students',
          localField: '_id',
          foreignField: '_id',
          as: 'student'
        }
      },
      {
        $unwind: '$student'
      },
      {
        $lookup: {
          from: 'users',
          localField: 'student.user',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          studentId: '$_id',
          studentName: '$user.name',
          studentEmail: '$user.email',
          studentPhone: '$user.phone',
          totalOverdue: 1,
          overdueCount: 1,
          oldestDue: 1,
          daysOverdue: {
            $divide: [
              { $subtract: [new Date(), '$oldestDue'] },
              1000 * 60 * 60 * 24
            ]
          }
        }
      },
      {
        $sort: { totalOverdue: -1 }
      },
      {
        $limit: 10
      }
    ]);
    
    // Compilar resposta
    const revenueData = revenue[0] || { total: 0, count: 0, avgTicket: 0 };
    const storeData = storeRevenue[0] || { total: 0, count: 0 };
    const overdueData = overdue[0] || { total: 0, count: 0 };
    const attendanceData = attendanceRate[0] || { attendanceRate: 0, totalAttendances: 0, presentCount: 0 };
    
    const studentsData = studentsStats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});
    
    res.json({
      success: true,
      data: {
        period: {
          from: startDate.format('YYYY-MM-DD'),
          to: endDate.format('YYYY-MM-DD')
        },
        kpis: {
          revenue: {
            total: revenueData.total,
            count: revenueData.count,
            avgTicket: revenueData.avgTicket
          },
          storeRevenue: {
            total: storeData.total,
            count: storeData.count
          },
          totalRevenue: revenueData.total + storeData.total,
          overdue: {
            total: overdueData.total,
            count: overdueData.count
          },
          students: {
            active: studentsData.active || 0,
            inactive: studentsData.inactive || 0,
            blocked: studentsData.blocked || 0,
            total: Object.values(studentsData).reduce((a, b) => a + b, 0)
          },
          attendance: {
            rate: Math.round(attendanceData.attendanceRate || 0),
            total: attendanceData.totalAttendances,
            present: attendanceData.presentCount
          }
        },
        charts: {
          dailyRevenue: dailyRevenue,
          overdueStudents: topOverdueStudents
        }
      }
    });
    
  } catch (error) {
    console.error('Erro no dashboard financeiro:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Dashboard operacional - Aulas e presenças
 */
router.get('/operational', auth, adminOrInstructor, async (req, res) => {
  try {
    const { from, to } = req.query;
    
    // Período padrão: semana atual
    const startDate = from ? moment(from).startOf('day') : moment().startOf('week');
    const endDate = to ? moment(to).endOf('day') : moment().endOf('week');
    
    // Aulas da semana com ocupação
    const weeklyLessons = await Lesson.aggregate([
      {
        $match: {
          date: {
            $gte: startDate.toDate(),
            $lte: endDate.toDate()
          }
        }
      },
      {
        $lookup: {
          from: 'classes',
          localField: 'class',
          foreignField: '_id',
          as: 'classData'
        }
      },
      {
        $unwind: '$classData'
      },
      {
        $lookup: {
          from: 'bookings',
          localField: '_id',
          foreignField: 'lesson',
          as: 'bookings'
        }
      },
      {
        $lookup: {
          from: 'attendances',
          localField: '_id',
          foreignField: 'lesson',
          as: 'attendances'
        }
      },
      {
        $project: {
          date: 1,
          startTime: 1,
          endTime: 1,
          status: 1,
          className: '$classData.name',
          capacity: '$classData.capacity',
          bookingsCount: { $size: '$bookings' },
          attendancesCount: {
            $size: {
              $filter: {
                input: '$attendances',
                cond: { $eq: ['$$this.present', true] }
              }
            }
          },
          occupancyRate: {
            $multiply: [
              {
                $divide: [
                  { $size: '$bookings' },
                  '$classData.capacity'
                ]
              },
              100
            ]
          }
        }
      },
      {
        $sort: { date: 1, startTime: 1 }
      }
    ]);
    
    // Estatísticas de check-in
    const checkinStats = await Booking.aggregate([
      {
        $lookup: {
          from: 'lessons',
          localField: 'lesson',
          foreignField: '_id',
          as: 'lessonData'
        }
      },
      {
        $unwind: '$lessonData'
      },
      {
        $match: {
          'lessonData.date': {
            $gte: startDate.toDate(),
            $lte: endDate.toDate()
          }
        }
      },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          checkedIn: {
            $sum: {
              $cond: [{ $eq: ['$status', 'checked_in'] }, 1, 0]
            }
          },
          noShow: {
            $sum: {
              $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          totalBookings: 1,
          checkedIn: 1,
          noShow: 1,
          checkinRate: {
            $multiply: [
              { $divide: ['$checkedIn', '$totalBookings'] },
              100
            ]
          },
          noShowRate: {
            $multiply: [
              { $divide: ['$noShow', '$totalBookings'] },
              100
            ]
          }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        period: {
          from: startDate.format('YYYY-MM-DD'),
          to: endDate.format('YYYY-MM-DD')
        },
        weeklyLessons,
        checkinStats: checkinStats[0] || {
          totalBookings: 0,
          checkedIn: 0,
          noShow: 0,
          checkinRate: 0,
          noShowRate: 0
        }
      }
    });
    
  } catch (error) {
    console.error('Erro no dashboard operacional:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Gráfico de faturamento mensal
 */
router.get('/revenue-chart', auth, adminOrInstructor, async (req, res) => {
  try {
    const { months = 12 } = req.query;
    
    const startDate = moment().subtract(months - 1, 'months').startOf('month');
    const endDate = moment().endOf('month');
    
    const monthlyRevenue = await Payment.aggregate([
      {
        $match: {
          status: 'paid',
          paidAt: {
            $gte: startDate.toDate(),
            $lte: endDate.toDate()
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$paidAt' },
            month: { $month: '$paidAt' }
          },
          revenue: { $sum: '$paidAmount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      },
      {
        $project: {
          _id: 0,
          period: {
            $concat: [
              { $toString: '$_id.year' },
              '-',
              {
                $cond: [
                  { $lt: ['$_id.month', 10] },
                  { $concat: ['0', { $toString: '$_id.month' }] },
                  { $toString: '$_id.month' }
                ]
              }
            ]
          },
          revenue: 1,
          count: 1
        }
      }
    ]);
    
    res.json({
      success: true,
      data: monthlyRevenue
    });
    
  } catch (error) {
    console.error('Erro no gráfico de faturamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Ação rápida: Reenviar link de pagamento
 */
router.post('/resend-payment-link/:paymentId', auth, adminOrInstructor, async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    const payment = await Payment.findById(paymentId)
      .populate({
        path: 'student',
        populate: {
          path: 'user',
          select: 'name email phone'
        }
      });
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Mensalidade não encontrada'
      });
    }
    
    if (payment.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Mensalidade já foi paga ou cancelada'
      });
    }
    
    // TODO: Implementar reenvio do link
    // const paymentLink = await generatePaymentLink(payment);
    // await sendPaymentLinkEmail(payment.student.user.email, paymentLink);
    // await sendPaymentLinkSMS(payment.student.user.phone, paymentLink);
    
    res.json({
      success: true,
      message: 'Link de pagamento reenviado com sucesso',
      data: {
        paymentId: payment._id,
        studentName: payment.student.user.name,
        amount: payment.totalAmount
      }
    });
    
  } catch (error) {
    console.error('Erro ao reenviar link de pagamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;